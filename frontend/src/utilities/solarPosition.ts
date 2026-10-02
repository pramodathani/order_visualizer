/** Where the sun stands in the sky at one moment. */
export interface SunPlace {
  elevationDegrees: number;
  azimuthDegrees: number;
}

const COMPASS_POINTS = [
  'N',
  'NE',
  'E',
  'SE',
  'S',
  'SW',
  'W',
  'NW',
];

/**
 * Works out the sun's height and compass direction for a place, with the low-precision formula NOAA and the Astronomical Almanac give, good to well under a degree for these years.
 */
export class SolarPosition {
  readonly latitudeDegrees: number;
  readonly longitudeDegrees: number;

  /**
   * Creates the calculator for one place.
   * @param latitudeDegrees North is positive.
   * @param longitudeDegrees East is positive.
   */
  constructor(latitudeDegrees: number, longitudeDegrees: number) {
    this.latitudeDegrees = latitudeDegrees;
    this.longitudeDegrees = longitudeDegrees;
  }

  /**
   * Finds where the sun is at a moment.
   * @param epochSeconds The moment.
   * @returns The elevation above the horizon (negative below it) and the azimuth clockwise from north, in degrees.
   */
  at(epochSeconds: number): SunPlace {
    const radians = Math.PI / 180;
    const days = epochSeconds / 86400 + 2440587.5 - 2451545.0;
    const meanAnomaly = (((357.529 + 0.98560028 * days) % 360) + 360) % 360;
    const meanLongitude = (((280.459 + 0.98564736 * days) % 360) + 360) % 360;
    const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly * radians) + 0.02 * Math.sin(2 * meanAnomaly * radians)) * radians;
    const obliquity = (23.439 - 0.00000036 * days) * radians;
    const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude));
    const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
    const siderealHours = (((18.697374558 + 24.06570982441908 * days) % 24) + 24) % 24;
    const hourAngle = (siderealHours * 15 + this.longitudeDegrees) * radians - rightAscension;
    const latitude = this.latitudeDegrees * radians;
    const elevation = Math.asin(Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle));
    const azimuth = Math.atan2(-Math.sin(hourAngle), Math.tan(declination) * Math.cos(latitude) - Math.sin(latitude) * Math.cos(hourAngle));
    return {
      elevationDegrees: elevation / radians,
      azimuthDegrees: (((azimuth / radians) % 360) + 360) % 360,
    };
  }

  /**
   * Names the compass point nearest an azimuth.
   * @param azimuthDegrees Clockwise from north.
   * @returns One of N, NE, E, SE, S, SW, W and NW.
   */
  compass(azimuthDegrees: number): string {
    return COMPASS_POINTS[Math.round(azimuthDegrees / 45) % 8];
  }
}

export const MUMBAI_LATITUDE = 19.076;
export const MUMBAI_LONGITUDE = 72.8777;

export const solarPosition = new SolarPosition(MUMBAI_LATITUDE, MUMBAI_LONGITUDE);
