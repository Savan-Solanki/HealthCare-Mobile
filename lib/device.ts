export function getDeviceDetails() {
  if (typeof window === 'undefined') {
    return {
      deviceId: 'server_side',
      deviceName: 'Server',
      deviceType: 'Desktop',
      browserVersion: 'Unknown',
    };
  }

  // 1. Get or generate a stable deviceId
  let deviceId = localStorage.getItem('pt_device_id');
  if (!deviceId) {
    deviceId =
      (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
      Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
    localStorage.setItem('pt_device_id', deviceId);
  }

  const ua = navigator.userAgent;

  // ── 2. Detect OS ──────────────────────────────────────────────────────────
  // IMPORTANT: Android/iOS MUST be checked before Linux because Android UA
  // strings contain "Linux" (e.g. "Linux; Android 14; Samsung Galaxy S23").
  let os = 'Unknown OS';

  if (/Android/i.test(ua)) {
    // Try to extract the phone brand/model from the UA
    // e.g. "Linux; Android 14; SM-G991B" or "Linux; Android 13; Redmi Note 12"
    const modelMatch = ua.match(/Android[\s/][0-9.]+[;)]\s*([^;)]+)/i);
    let model = modelMatch ? modelMatch[1].trim() : '';

    // Map known model codes/brands to friendly names
    if (model) {
      // Samsung (SM-XXXX codes)
      if (/^SM-/i.test(model)) {
        model = `Samsung (${model})`;
      } else if (/samsung/i.test(model)) {
        model = model.replace(/samsung/i, 'Samsung').trim();
      }
      // Xiaomi / Redmi / POCO
      else if (/xiaomi|redmi|poco/i.test(model)) {
        model = model.replace(/xiaomi/i, 'Xiaomi')
                     .replace(/redmi/i, 'Redmi')
                     .replace(/poco/i, 'POCO').trim();
      }
      // OnePlus
      else if (/oneplus/i.test(model)) {
        model = model.replace(/oneplus/i, 'OnePlus').trim();
      }
      // Realme
      else if (/realme/i.test(model)) {
        model = model.replace(/realme/i, 'Realme').trim();
      }
      // Oppo
      else if (/oppo/i.test(model)) {
        model = model.replace(/oppo/i, 'OPPO').trim();
      }
      // Vivo
      else if (/vivo/i.test(model)) {
        model = model.replace(/vivo/i, 'Vivo').trim();
      }
      // Motorola (moto codes)
      else if (/motorola|moto\s/i.test(model)) {
        model = model.replace(/motorola/i, 'Motorola')
                     .replace(/moto\s/i, 'Moto ').trim();
      }
      // Huawei / Honor
      else if (/huawei|honor/i.test(model)) {
        model = model.replace(/huawei/i, 'Huawei')
                     .replace(/honor/i, 'Honor').trim();
      }
      // Nokia
      else if (/nokia/i.test(model)) {
        model = model.replace(/nokia/i, 'Nokia').trim();
      }
      // Google Pixel
      else if (/pixel/i.test(model)) {
        model = model.replace(/pixel/i, 'Pixel').trim();
      }
    }

    os = model ? `Android – ${model}` : 'Android';
  } else if (/iPad/i.test(ua)) {
    os = 'iPad';
  } else if (/iPhone/i.test(ua)) {
    // Try to get iOS version for iPhone
    const iosMatch = ua.match(/iPhone OS ([\d_]+)/i);
    const iosVer = iosMatch ? ` (iOS ${iosMatch[1].replace(/_/g, '.')})` : '';
    os = `iPhone${iosVer}`;
  } else if (/iPod/i.test(ua)) {
    os = 'iPod';
  } else if (/Win/i.test(ua)) {
    // Distinguish Windows versions
    if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
    else if (/Windows NT 6\.3/i.test(ua)) os = 'Windows 8.1';
    else if (/Windows NT 6\.2/i.test(ua)) os = 'Windows 8';
    else if (/Windows NT 6\.1/i.test(ua)) os = 'Windows 7';
    else os = 'Windows';
  } else if (/Mac OS X|Macintosh/i.test(ua)) {
    os = 'macOS';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
  } else if (/Linux/i.test(ua)) {
    // Only genuine Linux desktop — not Android (already handled above)
    os = 'Linux';
  } else if (/X11/i.test(ua)) {
    os = 'UNIX';
  }

  // ── 3. Detect device type ─────────────────────────────────────────────────
  let deviceType = 'Desktop';
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = 'Tablet';
  } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Opera Mini/i.test(ua)) {
    deviceType = 'Mobile';
  }

  // ── 4. Detect browser ─────────────────────────────────────────────────────
  // Edge/Opera/Samsung MUST be checked before Chrome (their UA also has "Chrome")
  let browser = 'Unknown Browser';
  let version = 'Unknown';

  if (/Edg\//i.test(ua)) {
    browser = 'Edge';
    const m = ua.match(/Edg\/([0-9.]+)/i);
    if (m) version = m[1];
  } else if (/OPR\//i.test(ua) || /Opera\//i.test(ua)) {
    browser = 'Opera';
    const m = ua.match(/OPR\/([0-9.]+)/i) || ua.match(/Opera\/([0-9.]+)/i);
    if (m) version = m[1];
  } else if (/SamsungBrowser\//i.test(ua)) {
    browser = 'Samsung Browser';
    const m = ua.match(/SamsungBrowser\/([0-9.]+)/i);
    if (m) version = m[1];
  } else if (/CriOS\//i.test(ua)) {
    // Chrome on iOS
    browser = 'Chrome';
    const m = ua.match(/CriOS\/([0-9.]+)/i);
    if (m) version = m[1];
  } else if (/Chrome\//i.test(ua)) {
    browser = 'Chrome';
    const m = ua.match(/Chrome\/([0-9.]+)/i);
    if (m) version = m[1];
  } else if (/FxiOS\//i.test(ua)) {
    // Firefox on iOS
    browser = 'Firefox';
    const m = ua.match(/FxiOS\/([0-9.]+)/i);
    if (m) version = m[1];
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Firefox';
    const m = ua.match(/Firefox\/([0-9.]+)/i);
    if (m) version = m[1];
  } else if (/Safari\//i.test(ua)) {
    browser = 'Safari';
    const m = ua.match(/Version\/([0-9.]+)/i);
    if (m) version = m[1];
  } else if (/MSIE|Trident\//i.test(ua)) {
    browser = 'IE';
    const m = ua.match(/(?:MSIE |rv:)([0-9.]+)/i);
    if (m) version = m[1];
  }

  // ── 5. Build readable device name ─────────────────────────────────────────
  const deviceName = `${os} (${browser})`;

  return {
    deviceId,
    deviceName,
    deviceType,
    browserVersion: `${browser} ${version}`,
  };
}

