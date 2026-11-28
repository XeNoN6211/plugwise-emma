Control your Plugwise Emma Wired thermostat from Homey.

The Emma is a wired smart thermostat that talks to your Homey over Zigbee and controls your heating or cooling system through OpenTherm or on/off switching. With this app you can read the room temperature and humidity, change the target temperature and switch the mode, and use all of it in your Homey Flows and dashboards.

SUPPORTED DEVICES
- Plugwise Emma Wired (Pro and Essential), model 170-01

FEATURES
- Target temperature: 0 to 30 degrees Celsius, in steps of 0.5
- Current temperature, read from the built-in sensor
- Relative humidity
- Thermostat mode: Off, Heat or Cool. Heating and cooling use separate setpoints, so the target temperature changes when you switch modes.
- Battery level, only for units that actually have a battery. A wired Emma that is powered through OpenTherm has no battery, so the battery level is hidden instead of showing 0%.
- Temperature calibration: correct the temperature sensor with an offset of -2.5 to +2.5 degrees Celsius (in the device settings)

HOW TO ADD YOUR EMMA
1. In the Homey app, go to Devices, then Add Device, and choose Plugwise.
2. Select Emma Wired.
3. Put the Emma in pairing mode:
   - Press and hold the button on the back for 3 seconds, then release.
   - Within 1 second, press and hold it for 3 seconds again, then release.
   - Within 1 second, press and hold it for 10 seconds, then release.
4. The LED starts blinking. The Emma is now ready to pair and Homey will find it.

REQUIREMENTS
- A Homey with Zigbee (Homey Pro or a Homey Self-Hosted Server with a Zigbee connection)
- Homey firmware 12.4.0 or newer

Plugwise and Emma are names of their respective owners. Questions or problems? Please report them on the GitHub page of this app.
