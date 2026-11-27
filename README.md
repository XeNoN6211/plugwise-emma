# Plugwise Emma Wired - Homey App

Adds support for the [Plugwise Emma Wired](https://www.plugwise.com/en/product/emma-wired-pro/) thermostat to [Homey](https://homey.app).

The Emma is a smart wired thermostat that connects via Zigbee and controls your heating/cooling system through OpenTherm or on/off switching.

## Supported Devices

| Device | Model | Connection |
|--------|-------|------------|
| Emma Wired (Pro / Essential) | 170-01 | Zigbee |

## Features

- **Target temperature** - Set the desired temperature (0-30 °C, 0.5 °C steps)
- **Current temperature** - Read the room temperature from the built-in sensor
- **Humidity** - Read relative humidity
- **Thermostat mode** - Switch between Off, Heat, and Cool
- **Battery level** - Monitor battery percentage. Wired units without a battery (powered via OpenTherm) automatically hide this capability instead of showing 0%
- **Temperature calibration** - Adjust the temperature sensor offset (-2.5 to +2.5 °C)

Heating and cooling use separate setpoints, so switching modes will show the corresponding target temperature.

## Pairing

1. Open the Homey app and navigate to **Devices > Add Device > Plugwise**
2. Select **Emma Wired**
3. Put the Emma in pairing mode:
   - Press and hold the button on the back for 3 seconds, then release
   - Within 1 second, press and hold for 3 seconds again, then release
   - Within 1 second, press and hold for 10 seconds, then release
4. The LED will blink, indicating the Emma is ready to pair

## Development

```bash
# Install dependencies
npm install

# Lint
npm run lint

# Build (compose driver manifests)
homey app build

# Run on Homey (development)
homey app run

# Install on Homey (permanent)
homey app install

# Validate for publishing
homey app validate
```

## Changelog

### 1.0.2 (2026-11-27)
- Use the Emma Wired product photo on a blue background (#489fdf, the brand color of Plugwise's own Homey app) for the app images (250x175, 500x350, 1000x700) and the driver images (75x75, 500x500, 1000x1000)
- Clean up `assets/icon.svg`: evenly spaced dial ticks, text converted to paths (no fonts needed), same look as before
- Bump version to 1.0.2 (`.homeycompose/app.json`, `package.json`, `package-lock.json`) and add a 1.0.2 entry to `.homeychangelog.json`

### 1.0.1 (2026-11-27)
- Fix: wired Emma units (powered via OpenTherm) no longer show a battery level of 0%. The battery capability is removed when the device reports no battery, and added back when it does
- Fix: battery percentage is now converted correctly (0.5% steps) for both reads and reports, and the invalid value 255 is treated as unknown
- Add Paul Persoon-van Klooster as contributor in the app manifest
- Bump version to 1.0.1 (`.homeycompose/app.json`, `package.json`, `package-lock.json`) and add a 1.0.1 entry to `.homeychangelog.json`
- Update README: battery description, changelog and authors

### 1.0.0 (initial release)
- Initial release with Emma Wired thermostat support

## Authors

- Dennis Smink
- Paul Persoon-van Klooster
