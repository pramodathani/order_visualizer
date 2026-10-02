# frontend/src/components/NavigationToolbar.tsx

One toolbar shared by the one-order and whole-day views, in each canvas's bottom-left corner, so the two views are navigated the same way. It reaches the scene through a getter rather than holding it, because the scene is created inside an effect after the toolbar first renders. The drag mode is per view and resets to Rotate when the view is reopened.

The Sky switch is remembered per browser and is on by default. The readout under the buttons shows the time the sky shows, in IST, and where the sun stands, for example "☀ 11:41 IST · sun 65° up, SE · Mumbai" or "☾ 19:11 IST · sun 10° below the horizon, W".
