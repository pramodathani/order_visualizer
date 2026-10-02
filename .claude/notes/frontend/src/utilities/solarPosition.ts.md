# frontend/src/utilities/solarPosition.ts

The low-precision solar position formula from NOAA and the Astronomical Almanac: mean anomaly and longitude, ecliptic longitude, obliquity, right ascension and declination, Greenwich sidereal time, then hour angle, elevation and azimuth. It is good to well under a degree for these years.

Checked in Python on 2026-10-02 for Mumbai on 1 October 2026: solar noon 12:28 IST at 67.7° elevation (declination −3.22°), sunrise about 06:30 IST at azimuth 93°, and 64.8° elevation at 11:40 IST, azimuth 151° (south-south-east).

The place is fixed to Mumbai (19.076° N, 72.8777° E), home of the NSE, because the orders are Indian equity orders. It is a constant rather than a setting; change `MUMBAI_LATITUDE` and `MUMBAI_LONGITUDE` to move it.
