'use strict';

const { ZigBeeDevice } = require('homey-zigbeedriver');
const { CLUSTER } = require('zigbee-clusters');

const SYSTEM_MODE = {
  off: 0,
  auto: 1,
  cool: 3,
  heat: 4,
};

// Maps both numeric and string values from the Zigbee cluster to Homey mode strings
function parseSystemMode(value) {
  if (typeof value === 'string') {
    // zigbee-clusters returns enum strings like 'cool', 'heat', 'off'
    if (value === 'off' || value === 'heat' || value === 'cool' || value === 'auto') {
      return value;
    }
  }
  // Numeric values from readAttributes
  const map = {
    0: 'off', 1: 'auto', 3: 'cool', 4: 'heat',
  };
  return map[value] || null;
}

// Zigbee reports battery percentage in 0.5% steps; 255 (0xFF) means invalid/unknown.
function parseBatteryPercentage(value) {
  if (typeof value !== 'number' || value < 0 || value === 255) return null;
  return Math.min(100, Math.round(value / 2));
}

class EmmaDevice extends ZigBeeDevice {

  async onNodeInit({ zclNode }) {
    await super.onNodeInit({ zclNode });

    this._currentMode = 'heat';

    // Register all capabilities synchronously (no awaiting Zigbee calls)
    this._registerTargetTemperature();
    this._registerMeasureTemperature();
    this._registerMeasureHumidity();
    this._registerThermostatMode();
    this._registerMeasureBattery();

    // Configure attribute reporting in the background (don't block init)
    this._configureReporting();

    // Read initial state in the background
    this._readInitialState().catch((err) => this.error('Failed to read initial state', err));

    // Remove the battery capability on wired units that have no battery
    this._updateBatterySupport().catch((err) => this.error('Failed to update battery support', err));
  }

  _registerTargetTemperature() {
    this.registerCapability('target_temperature', CLUSTER.THERMOSTAT, {
      set: 'occupiedHeatingSetpoint',
      setParser(value) {
        const attribute = this._currentMode === 'cool'
          ? 'occupiedCoolingSetpoint'
          : 'occupiedHeatingSetpoint';

        this.zclNode.endpoints[this.getClusterEndpoint(CLUSTER.THERMOSTAT)]
          .clusters[CLUSTER.THERMOSTAT.NAME]
          .writeAttributes({ [attribute]: Math.round(value * 100) })
          .catch((err) => this.error('Failed to write setpoint', err));

        return null;
      },
      get: 'occupiedHeatingSetpoint',
      getParser(value) {
        return Math.round((value / 100) * 10) / 10;
      },
      reportParser(value) {
        return Math.round((value / 100) * 10) / 10;
      },
      report: 'occupiedHeatingSetpoint',
      getOpts: {
        getOnStart: true,
        getOnOnline: true,
      },
    });

    // Also listen for cooling setpoint reports
    const thermostatEndpoint = this.getClusterEndpoint(CLUSTER.THERMOSTAT);
    if (thermostatEndpoint !== undefined) {
      this.zclNode.endpoints[thermostatEndpoint]
        .clusters[CLUSTER.THERMOSTAT.NAME]
        .on('attr.occupiedCoolingSetpoint', (value) => {
          if (this._currentMode === 'cool') {
            this.setCapabilityValue('target_temperature', Math.round((value / 100) * 10) / 10)
              .catch((err) => this.error('Failed to set cooling target_temperature', err));
          }
        });
    }
  }

  _registerMeasureTemperature() {
    this.registerCapability('measure_temperature', CLUSTER.THERMOSTAT, {
      get: 'localTemperature',
      getParser(value) {
        return Math.round((value / 100) * 10) / 10;
      },
      reportParser(value) {
        return Math.round((value / 100) * 10) / 10;
      },
      report: 'localTemperature',
      getOpts: {
        getOnStart: true,
        getOnOnline: true,
      },
    });
  }

  _registerMeasureHumidity() {
    if (!this.hasCapability('measure_humidity')) return;

    this.registerCapability('measure_humidity', CLUSTER.RELATIVE_HUMIDITY_MEASUREMENT, {
      get: 'measuredValue',
      reportParser(value) {
        return Math.round(value / 100);
      },
      report: 'measuredValue',
      getOpts: {
        getOnStart: true,
        getOnOnline: true,
      },
    });
  }

  _registerThermostatMode() {
    this.registerCapability('thermostat_mode', CLUSTER.THERMOSTAT, {
      set: 'systemMode',
      setParser(value) {
        const systemMode = SYSTEM_MODE[value];
        this._currentMode = value;

        this.zclNode.endpoints[this.getClusterEndpoint(CLUSTER.THERMOSTAT)]
          .clusters[CLUSTER.THERMOSTAT.NAME]
          .writeAttributes({ systemMode })
          .then(() => {
            if (value !== 'off') {
              return this._readActiveSetpoint();
            }
            return null;
          })
          .catch((err) => this.error('Failed to write systemMode', err));

        return null;
      },
      get: 'systemMode',
      getParser(value) {
        const mode = parseSystemMode(value);
        if (mode) {
          this._currentMode = mode;
        }
        return mode || 'heat';
      },
      reportParser(value) {
        const mode = parseSystemMode(value);
        if (mode) {
          this._currentMode = mode;
        }
        return mode || 'heat';
      },
      report: 'systemMode',
      getOpts: {
        getOnStart: true,
        getOnOnline: true,
      },
    });
  }

  _registerMeasureBattery() {
    if (!this.hasCapability('measure_battery')) return;

    this.registerCapability('measure_battery', CLUSTER.POWER_CONFIGURATION, {
      get: 'batteryPercentageRemaining',
      getParser: parseBatteryPercentage,
      reportParser: parseBatteryPercentage,
      report: 'batteryPercentageRemaining',
      getOpts: {
        getOnStart: true,
        getOnOnline: true,
      },
    });
  }

  // A wired Emma (powered via OpenTherm) has no battery and reports 0% or an
  // invalid value. Remove the battery capability in that case, and add it back
  // when the device does report a real battery.
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
      return;
    }

    const percentage = parseBatteryPercentage(attrs.batteryPercentageRemaining);
    const voltage = attrs.batteryVoltage;
    const hasVoltage = typeof voltage === 'number' && voltage > 0 && voltage < 255;
    const hasBattery = (percentage !== null && percentage > 0) || hasVoltage;

    if (!hasBattery && this.hasCapability('measure_battery')) {
      this.log('No battery reported (wired power), removing measure_battery');
      await this.removeCapability('measure_battery');
    } else if (hasBattery && !this.hasCapability('measure_battery')) {
      this.log('Battery reported, adding measure_battery');
      await this.addCapability('measure_battery');
      this._registerMeasureBattery();
    }

    if (hasBattery && percentage !== null) {
      await this.setCapabilityValue('measure_battery', percentage);
    }
  }

  _configureReporting() {
    this.configureAttributeReporting([
      {
        endpointId: 1,
        cluster: CLUSTER.THERMOSTAT,
        attributeName: 'occupiedHeatingSetpoint',
        minInterval: 0,
        maxInterval: 300,
        minChange: 10,
      },
      {
        endpointId: 1,
        cluster: CLUSTER.THERMOSTAT,
        attributeName: 'occupiedCoolingSetpoint',
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
      const thermostatCluster = this.zclNode
        .endpoints[this.getClusterEndpoint(CLUSTER.THERMOSTAT)]
        .clusters[CLUSTER.THERMOSTAT.NAME];

      const attrs = await thermostatCluster.readAttributes([
        'systemMode',
        'occupiedHeatingSetpoint',
        'occupiedCoolingSetpoint',
      ]);

      if (attrs.systemMode !== undefined) {
        const mode = parseSystemMode(attrs.systemMode);
        if (mode) {
          this._currentMode = mode;
          await this.setCapabilityValue('thermostat_mode', mode);
        }
      }

      const setpoint = this._currentMode === 'cool'
        ? attrs.occupiedCoolingSetpoint
        : attrs.occupiedHeatingSetpoint;

      if (setpoint !== undefined) {
        await this.setCapabilityValue('target_temperature',
          Math.round((setpoint / 100) * 10) / 10);
      }
    } catch (err) {
      this.error('Failed to read initial state', err);
    }
  }

  async _readActiveSetpoint() {
    try {
      const attribute = this._currentMode === 'cool'
        ? 'occupiedCoolingSetpoint'
        : 'occupiedHeatingSetpoint';

      const thermostatCluster = this.zclNode
        .endpoints[this.getClusterEndpoint(CLUSTER.THERMOSTAT)]
        .clusters[CLUSTER.THERMOSTAT.NAME];

      const result = await thermostatCluster.readAttributes([attribute]);
      const value = result[attribute];

      if (value !== undefined) {
        await this.setCapabilityValue('target_temperature',
          Math.round((value / 100) * 10) / 10);
      }
    } catch (err) {
      this.error('Failed to read active setpoint', err);
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('temperature_calibration')) {
      try {
        await this.zclNode
          .endpoints[this.getClusterEndpoint(CLUSTER.THERMOSTAT)]
          .clusters[CLUSTER.THERMOSTAT.NAME]
          .writeAttributes({
            localTemperatureCalibration: Math.round(newSettings.temperature_calibration * 10),
          });
      } catch (err) {
        this.error('Failed to write temperature calibration', err);
      }
    }
  }

}

module.exports = EmmaDevice;
