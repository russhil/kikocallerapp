import {BASE_URL} from '../config';

export async function sendOtp(phone) {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({phone}),
    });
    const body = await res.text();
    if (!res.ok) {
      return {success: false, reason: `Server error ${res.status}: ${body}`};
    }
    return {success: true};
  } catch (e) {
    if (e.name === 'TypeError') {
      return {success: false, reason: 'No internet connection.'};
    }
    return {success: false, reason: `Network error: ${e.message}`};
  }
}

export async function verifyOtp(phone, otp) {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({phone, otp}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      token: data.token,
      isNewUser: data.is_new_user,
      phone: data.user?.phone || phone,
      shopName: data.user?.shop_name || '',
      shopkeeperName: data.user?.shopkeeper_name || '',
    };
  } catch (e) {
    return null;
  }
}

export async function signup(token, shopName, shopkeeperName) {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({shop_name: shopName, shopkeeper_name: shopkeeperName}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      token: data.token,
      isNewUser: false,
      phone: data.user?.phone || '',
      shopName: data.user?.shop_name || shopName,
      shopkeeperName: data.user?.shopkeeper_name || shopkeeperName,
    };
  } catch (e) {
    return null;
  }
}

export async function getMe(token) {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: {Authorization: `Bearer ${token}`},
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch (e) {
    return null;
  }
}
