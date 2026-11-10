import { LedgerEntry, GoldLedgerEntry, Party, User } from '../../shared/types.js';

export function generateWhatsAppChitText(
  entry: LedgerEntry,
  jewellerName = 'Lalit Jewellers',
  karigarName = 'Ramesh Karigar'
): string {
  const dateStr = new Date(entry.timestamp).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const typeLabel =
    entry.transaction_type === 'ISSUE'
      ? 'ISSUE • सोना जारी (जमा दिया)'
      : entry.transaction_type === 'RETURN'
      ? 'RETURN • सोना वापसी'
      : 'WASTAGE • छीलन/घट निपटारा';

  const shortHash = entry.transaction_hash.slice(0, 16);

  const text = `👑 *GOLDSTACK DIGITAL VOUCHER CHIT* 👑
_स्वर्ण बही-खाता प्रमाणित रसीद_
━━━━━━━━━━━━━━━━━━━━
📅 *Date:* ${dateStr}
🔖 *Voucher Type:* ${typeLabel}
🏢 *Jeweller:* ${jewellerName}
🔨 *Karigar:* ${karigarName}
⚖️ *Gross Weight:* *${Number(entry.weight_grams).toFixed(3)} g*
✨ *Purity:* *${entry.purity_karat}K* (Hallmark BIS)
🪙 *Pure Gold (24K):* *${Number(entry.pure_weight_grams).toFixed(3)} g Fine*
📦 *Order Ref:* ${entry.order_id || 'N/A'}
🔢 *Block Number:* #${entry.sequence_number}
🔒 *SHA-256 Hash:* \`${shortHash}...\`
━━━━━━━━━━━━━━━━━━━━
✅ *Status:* ${entry.status === 'CONFIRMED' ? 'Confirmed & Dual-Signed' : 'Pending Signature'}
_Cryptographically secured on Immutable Ledger._`;

  return text;
}

export function openWhatsAppShare(
  entry: GoldLedgerEntry,
  phone?: string,
  jewellerName?: string,
  karigarName?: string
): void {
  const text = generateWhatsAppChitText(entry, jewellerName, karigarName);
  const encoded = encodeURIComponent(text);
  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
  const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;

  if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
}

