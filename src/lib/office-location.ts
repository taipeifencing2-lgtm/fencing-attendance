// 打卡地點限制:中華民國擊劍協會 - 台北市中山區朱崙街20號
export const OFFICE_LOCATION = {
  name: "台北市中山區朱崙街20號",
  lat: 25.05095,
  lng: 121.53625,
  radiusMeters: 500,
};

// 公司對外固定 IP（連上公司 WiFi 即可打卡）
export const OFFICE_IP = "114.32.57.19";

/** Haversine 距離 (公尺) */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface GeoCheckResult {
  ok: boolean;
  distance?: number;
  message: string;
  coords?: { lat: number; lng: number; accuracy: number };
}

export function getCurrentPositionAsync(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("此裝置不支援定位功能"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });
  });
}

/** 先檢查公司 WiFi IP，若符合直接通過；否則再做 GPS 驗證 */
export async function checkAtOfficeOrWifi(): Promise<GeoCheckResult> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
    const { ip } = await res.json() as { ip: string };
    if (ip === OFFICE_IP) {
      return { ok: true, message: "已連接公司 WiFi" };
    }
  } catch {
    // IP 查詢失敗，繼續做 GPS 驗證
  }
  return checkAtOffice();
}

export async function checkAtOffice(): Promise<GeoCheckResult> {
  try {
    const pos = await getCurrentPositionAsync();
    const { latitude, longitude, accuracy } = pos.coords;
    const dist = distanceMeters(latitude, longitude, OFFICE_LOCATION.lat, OFFICE_LOCATION.lng);
    // 允許 GPS 精度誤差:有效距離 = 距離 - 精度
    const effective = Math.max(0, dist - accuracy);
    if (effective <= OFFICE_LOCATION.radiusMeters) {
      return {
        ok: true,
        distance: dist,
        message: `已在辦公地點 (距離約 ${Math.round(dist)} 公尺)`,
        coords: { lat: latitude, lng: longitude, accuracy },
      };
    }
    return {
      ok: false,
      distance: dist,
      message: `不在辦公地點範圍內 (距離 ${Math.round(dist)} 公尺,需在 ${OFFICE_LOCATION.radiusMeters} 公尺內)`,
      coords: { lat: latitude, lng: longitude, accuracy },
    };
  } catch (err) {
    const e = err as GeolocationPositionError | Error;
    let msg = "無法取得定位";
    if ("code" in e) {
      if (e.code === 1) msg = "請允許瀏覽器使用定位權限";
      else if (e.code === 2) msg = "定位訊號不可用,請到開闊處再試";
      else if (e.code === 3) msg = "定位逾時,請再試一次";
    } else if (e.message) {
      msg = e.message;
    }
    return { ok: false, message: msg };
  }
}
