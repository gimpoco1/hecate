type DeviceOrientationPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export type CompassOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number
}

export async function requestDeviceHeadingPermission() {
  if (typeof DeviceOrientationEvent === 'undefined') return false
  const orientation = DeviceOrientationEvent as DeviceOrientationPermission
  if (!orientation.requestPermission) return true
  try {
    return await orientation.requestPermission() === 'granted'
  } catch {
    return false
  }
}

export function compassHeadingFromEvent(event: CompassOrientationEvent) {
  if (typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)) {
    return (event.webkitCompassHeading + 360) % 360
  }
  if (event.absolute && typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    return (360 - event.alpha) % 360
  }
  return undefined
}
