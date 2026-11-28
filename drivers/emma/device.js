'use strict';

const { ZigBeeDevice } = require('homey-zigbeedriver');
const { CLUSTER } = require('zigbee-clusters');

const SYSTEM_MODE = {
  off: 0,
  auto: 1,
  cool: 3,
  heat: 4,
};

const SYSTEM_MODE_NAMES = {
  0: 'off',
  1: 'auto',
  3: 'cool',
  4: 'heat',
};

const HEATING_SETPOINT = 'occupiedHeatingSetpoint';
const COOLING_SETPOINT = 'occupiedCoolingSetpoint';

// Maps both numeric and string values from the Zigbee cluster to Homey mode strings
function parseSystemMode(value) {
  if (typeof value === 'string') {
    // zigbee-clusters returns enum strings like 'cool', 'heat', 'off'
    return Object.prototype.hasOwnProperty.call(SYSTEM_MODE, value) ? value : null;
  }
  // Numeric values from readAttributes
  return SYSTEM_MODE_NAMES[value] || null;
}

// Zigbee reports temperatures in 0.01 °C; Homey shows them with 0.1 °C precision.
function parseTemperature(value) {
  return Math.round((value / 100) * 10) / 10;
}

// Zigbee reports relative humidity in 0.01 %; Homey shows whole percentages.
function parseHumidity(value) {
  return Math.round(value / 100);
}

// Zigbee reports battery percentage in 0.5% steps; 255 (0xFF) means invalid/unknown.
function parseBatteryPercentage(value) {
  if (typeof value !== 'number' || value < 0 || value === 255) return null;
  return Math.min(100, Math.round(value / 2));
}

const REPORTING_OPTS = {
  getOnStart: true,
  getOnOnline: true,
};

class EmmaDevice extends ZigBeeDevice {

  async onNodeInit({ zclNode }) {
    await super.onNodeInit({ zclNode });

    this._currentMode = 'heat';

    // Register all capabilities synchronously (no awaiting Zigbee calls)
    this._registerTargetTemperature();
    this._registerMeasureTemperature();
    this._registerMeasureHumidity();
    this._registerThermostatMode();

    // Configure attribute reporting in the background (don't block init)
    this._configureReporting();

    // Read initial state in the background
    this._readInitialState().catch((err) => this.error('Failed to read initial state', err));

    // Add the battery capability only on units that really have a battery
    this._updateBatterySupport().catch((err) => this.error('Failed to update battery support', err));
  }

  // The thermostat cluster of this device. Throws when the endpoint is not available.
  _getThermostatCluster() {
    const endpoint = this.getClusterEndpoint(CLUSTER.THERMOSTAT);
    if (endpoint === undefined || endpoint === null) {
      throw new Error('Thermostat cluster endpoint not found');
    }
    return this.zclNode.endpoints[endpoint].clusters[CLUSTER.THERMOSTAT.NAME];
  }

  // Heating and cooling use separate setpoints; this is the one for the current mode.
  _getActiveSetpointAttribute() {
    return this._currentMode === 'cool' ? COOLING_SETPOINT : HEATING_SETPOINT;
  }

  // Stores a mode reported by the device and returns the value for the capability.
  _parseMode(value) {
    const mode = parseSystemMode(value);
    if (mode) {
      this._currentMode = mode;
    }
    return mode || 'heat';
  }

  _registerTargetTemperature() {
    this.registerCapability('target_temperature', CLUSTER.THERMOSTAT, {
      set: HEATING_SETPOINT,
      setParser: (value) => {
        this._getThermostatCluster()
          .writeAttributes({ [this._getActiveSetpointAttribute()]: Math.round(value * 100) })
          .catch((err) => this.error('Failed to write setpoint', err));

        return null;
      },
      get: HEATING_SETPOINT,
      getParser: parseTemperature,
      reportParser: parseTemperature,
      report: HEATING_SETPOINT,
      getOpts: REPORTING_OPTS,
    });

    // Also listen for cooling setpoint reports
    try {
      this._getThermostatCluster().on(`attr.${COOLING_SETPOINT}`, (value) => {
        if (this._currentMode === 'cool') {
          this.setCapabilityValue('target_temperature', parseTemperature(value))
            .catch((err) => this.error('Failed to set cooling target_temperature', err));
        }
      });
    } catch (err) {
      this.error('Failed to listen for cooling setpoint reports', err);
    }
  }

  _registerMeasureTemperature() {
    this.registerCapability('measure_temperature', CLUSTER.THERMOSTAT, {
      get: 'localTemperature',
      getParser: parseTemperature,
      reportParser: parseTemperature,
      report: 'localTemperature',
      getOpts: REPORTING_OPTS,
    });
  }

  _registerMeasureHumidity() {
    if (!this.hasCapability('measure_humidity')) return;

    this.registerCapability('measure_humidity', CLUSTER.RELATIVE_HUMIDITY_MEASUREMENT, {
      get: 'measuredValue',
      getParser: parseHumidity,
      reportParser: parseHumidity,
      report: 'measuredValue',
      getOpts: REPORTING_OPTS,
    });
  }

  _registerThermostatMode() {
    this.registerCapability('thermostat_mode', CLUSTER.THERMOSTAT, {
      set: 'systemMode',
      setParser: (value) => {
        this._currentMode = value;

        this._getThermostatCluster()
          .writeAttributes({ systemMode: SYSTEM_MODE[value] })
          .then(() => (value !== 'off' ? this._readActiveSetpoint() : null))
          .catch((err) => this.error('Failed to write systemMode', err));

        return null;
      },
      get: 'systemMode',
      getParser: (value) => this._parseMode(value),
      reportParser: (value) => this._parseMode(value),
      report: 'systemMode',
      getOpts: REPORTING_OPTS,
    });
  }

  _registerMeasureBattery() {
    if (this._batteryRegistered || !this.hasCapability('measure_battery')) return;
    this._batteryRegistered = true;

    this.registerCapability('measure_battery', CLUSTER.POWER_CONFIGURATION, {
      get: 'batteryPercentageRemaining',
      getParser: parseBatteryPercentage,
      reportParser: parseBatteryPercentage,
      report: 'batteryPercentageRemaining',
      getOpts: REPORTING_OPTS,
    });
  }

  // A wired Emma (powered via OpenTherm) has no battery and reports 0% or an
  // invalid value. The battery capability is not part of the driver manifest, so
  // a wired unit never shows "battery empty" while pairing. It is only added when
  // the device reports a real battery, and removed again from older pairings
  // that still have it.
  async _updateBatterySupport() {
    let attrs;
    try {
      const endpoint = this.getClusterEndpoint(CLUSTER.POWER_CONFIGURATION);
      if (endpoint === undefined || endpoint === null) return;

      attrs = await this.zclNode
        .endpoints[endpoint]
        .clusters[CLUSTER.POWER_CONFIGURATION.NAME]
        .readAttributes(['batteryPercentageRemaining', 'batteryVoltage']);
    } catch (err) {
      // Device unreachable or attribute unsupported: keep the current state.
      this.error('Failed to read battery attributes', err);
      // Older pairings that already have the capability keep working as before.
      this._registerMeasureBattery();
      return;
    }

    const percentage = parseBatteryPercentage(attrs.batteryPercentageRemaining);
    const voltage = attrs.batteryVoltage;
    const hasVoltage = typeof voltage === 'number' && voltage > 0 && voltage < 255;
    const hasBattery = (percentage !== null && percentage > 0) || hasVoltage;

    if (!hasBattery) {
      if (this.hasCapability('measure_battery')) {
        this.log('No battery reported (wired power), removing measure_battery');
        await this.removeCapability('measure_battery');
      }
      return;
    }

    if (!this.hasCapability('measure_battery')) {
      this.log('Battery reported, adding measure_battery');
      await this.addCapability('measure_battery');
    }
    await this.setEnergy({ batteries: ['AA', 'AA'] })
      .catch((err) => this.error('Failed to set batteries', err));
    this._registerMeasureBattery();

    if (percentage !== null) {
      await this.setCapabilityValue('measure_battery', percentage);
    }
  }

  _configureReporting() {
    this.configureAttributeReporting([
      {
        endpointId: 1,
        cluster: CLUSTER.THERMOSTAT,
        attributeName: HEATING_SETPOINT,
        minInterval: 0,
        maxInterval: 300,
        minChange: 10,
      },
      {
        endpointId: 1,
        cluster: CLUSTER.THERMOSTAT,
        attributeName: COOLING_SETPOINT,
        minInterval: 0,
        maxInterval: 300,
        minChange: 10,
      },
      {
        endpointId: 1,
        cluster: CLUSTER.THERMOSTAT,
        attributeName: 'systemMode',
        minInterval: 0,
        maxInterval: 300,
        minChange: 0,
      },
    ])
      .catch((err) => this.error('Failed to configure thermostat reporting', err));

    // Humidity and battery reporting are configured by the device itself,
    // no additional configuration needed (device rejects INVALID_VALUE).
  }

  async _readInitialState() {
    try {
      const attrs = await this._getThermostatCluster().readAttributes([
        'systemMode',
        HEATING_SETPOINT,
        COOLING_SETPOINT,
      ]);

      if (attrs.systemMode !== undefined) {
        const mode = parseSystemMode(attrs.systemMode);
        if (mode) {
          this._currentMode = mode;
          await this.setCapabilityValue('thermostat_mode', mode);
        }
      }

      const setpoint = attrs[this._getActiveSetpointAttribute()];
      if (setpoint !== undefined) {
        await this.setCapabilityValue('target_temperature', parseTemperature(setpoint));
      }
    } catch (err) {
      this.error('Failed to read initial state', err);
    }
  }

  async _readActiveSetpoint() {
    try {
      const attribute = this._getActiveSetpointAttribute();
      const result = await this._getThermostatCluster().readAttributes([attribute]);
      const value = result[attribute];

      if (value !== undefined) {
        await this.setCapabilityValue('target_temperature', parseTemperature(value));
      }
    } catch (err) {
      this.error('Failed to read active setpoint', err);
    }
  }

  async onSettings({ newSettings, changedKeys }) {
    if (changedKeys.includes('temperature_calibration')) {
      try {
        await this._getThermostatCluster().writeAttributes({
          localTemperatureCalibration: Math.round(newSettings.temperature_calibration * 10),
        });
      } catch (err) {
        this.error('Failed to write temperature calibration', err);
      }
    }
  }

}

module.exports = EmmaDevice;
