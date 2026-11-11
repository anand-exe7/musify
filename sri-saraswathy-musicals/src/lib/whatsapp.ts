/**
 * WhatsApp links and emojis that survive the trip into WhatsApp.
 *
 * • Links go to `https://api.whatsapp.com/send/?phone=…&text=…` — the `wa.me` shortcut redirects, and that redirect
 *   mangles Unicode, which is what turned emojis into "?" / empty boxes.
 * • Emojis are built with `String.fromCodePoint` (no raw emoji characters in the source) and only single code-point
 *   emojis are used — no U+FE0F variation selectors or modifiers, which WhatsApp's link handler decodes wrongly.
 * • The finished message is URL-encoded exactly once, here.
 */
const cp = (n: number) => String.fromCodePoint(n);

export const E = {
  notes: cp(0x1f3b6), // 🎶
  note: cp(0x1f3b5), // 🎵
  wave: cp(0x1f44b), // 👋
  receipt: cp(0x1f9fe), // 🧾
  memo: cp(0x1f4dd), // 📝
  calendar: cp(0x1f4c5), // 📅
  pin: cp(0x1f4cd), // 📍
  cart: cp(0x1f6d2), // 🛒
  package: cp(0x1f4e6), // 📦
  tag: cp(0x1f516), // 🔖
  chart: cp(0x1f4ca), // 📊
  dollar: cp(0x1f4b5), // 💵
  money: cp(0x1f4b0), // 💰
  card: cp(0x1f4b3), // 💳
  gift: cp(0x1f381), // 🎁
  truck: cp(0x1f69a), // 🚚
  check: cp(0x2705), // ✅
  hourglass: cp(0x23f3), // ⏳
  doc: cp(0x1f4c4), // 📄
  bulb: cp(0x1f4a1), // 💡
  pray: cp(0x1f64f), // 🙏
  guitar: cp(0x1f3b8), // 🎸
  keyboard: cp(0x1f3b9), // 🎹
  drum: cp(0x1f941), // 🥁
  ticket: cp(0x1f3ab), // 🎫
  wrench: cp(0x1f527), // 🔧
  clipboard: cp(0x1f4cb), // 📋
  party: cp(0x1f389), // 🎉
  sparkle: cp(0x2728), // ✨
  star: cp(0x2b50), // ⭐
  person: cp(0x1f464), // 👤
  phone: cp(0x1f4de), // 📞
  mobile: cp(0x1f4f1), // 📱
} as const;

/** 10-digit Indian numbers get the 91 country code; anything longer is used as given. Empty → no recipient. */
function waNumber(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

/** The WhatsApp link for `text` (to `phone` when given). */
export function waUrl(phone: string | null | undefined, text: string): string {
  const to = waNumber(phone);
  return `https://api.whatsapp.com/send/?${to ? `phone=${to}&` : ""}text=${encodeURIComponent(text)}`;
}

/** Open WhatsApp with the message. */
export function openWhatsApp(phone: string | null | undefined, text: string): void {
  window.open(waUrl(phone, text), "_blank");
}
