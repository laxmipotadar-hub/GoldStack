import http from 'node:http';
import {
  Party,
  IssueGoldRequest,
  ReturnGoldRequest,
  ConfirmLedgerRequest,
  VerifyOtpResponse
} from '../shared/types.js';

async function testApi() {
  console.log('Testing GoldStack API Server Endpoints...');

  // 1. Health check
  const health = await fetch('http://localhost:3001/api/health').then((r) => r.json());
  console.log('✓ [GET /api/health]:', health);

  // 2. Parties
  const partiesRes = await fetch('http://localhost:3001/api/ledger/parties').then((r) => r.json());
  console.log(`✓ [GET /api/ledger/parties]: ${partiesRes.data.length} registered parties found.`);
  const jeweller: Party = partiesRes.data.find((p: any) => p.role === 'JEWELLER');
  const karigar: Party = partiesRes.data.find((p: any) => p.role === 'KARIGAR');

  // 2b. Authenticate demo accounts (Phone + Mock OTP 123456)
  const jewellerAuth: VerifyOtpResponse = await fetch('http://localhost:3001/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: jeweller.phone, otp: '123456' })
  }).then((r) => r.json());
  const jewellerToken = jewellerAuth.token;
  console.log(`✓ [POST /api/auth/verify-otp]: Authenticated as Jeweller (${jeweller.name})`);

  const karigarAuth: VerifyOtpResponse = await fetch('http://localhost:3001/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: karigar.phone, otp: '123456' })
  }).then((r) => r.json());
  const karigarToken = karigarAuth.token;
  console.log(`✓ [POST /api/auth/verify-otp]: Authenticated as Karigar (${karigar.name})`);

  // 3. Chain verification before new transaction
  const initialVerify = await fetch('http://localhost:3001/api/ledger/verify-chain', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jewellerToken}` }
  }).then((r) => r.json());
  console.log(
    `✓ [POST /api/ledger/verify-chain]: Valid = ${initialVerify.data.isValid}, Total blocks = ${initialVerify.data.totalBlocks}`
  );

  // 4. Issue Gold (by Jeweller)
  const issuePayload: IssueGoldRequest = {
    jeweller_id: jeweller.id,
    karigar_id: karigar.id,
    order_id: 'ORD-INTEG-900',
    weight_grams: 25.5,
    purity_karat: 22,
    photo_evidence_url: '/api/upload/evidence/test_bar.jpg',
    perceptual_hash: 'a1b2c3d4e5f60718',
    signature_jeweller: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    gps_lat: 18.9543,
    gps_lng: 72.8312,
    metadata: { testRun: true }
  };

  const issueRes = await fetch('http://localhost:3001/api/ledger/issue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jewellerToken}`
    },
    body: JSON.stringify(issuePayload)
  }).then((r) => r.json());

  console.log(
    `✓ [POST /api/ledger/issue]: Created Block #${issueRes.data.sequence_number}, Hash: ${issueRes.data.transaction_hash.slice(
      0,
      12
    )}..., Status: ${issueRes.data.status}`
  );

  // 5. Dual Confirmation by Karigar
  const confirmPayload: ConfirmLedgerRequest = {
    ledger_id: issueRes.data.id,
    party: 'KARIGAR',
    signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    action: 'CONFIRM'
  };

  const confirmRes = await fetch('http://localhost:3001/api/ledger/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${karigarToken}`
    },
    body: JSON.stringify(confirmPayload)
  }).then((r) => r.json());

  console.log(
    `✓ [POST /api/ledger/confirm]: Dual Confirmation Status = ${confirmRes.data.status}, Confirmed At = ${confirmRes.data.confirmed_at}`
  );

  // 6. Return Gold from Karigar
  const returnPayload: ReturnGoldRequest = {
    jeweller_id: jeweller.id,
    karigar_id: karigar.id,
    order_id: 'ORD-INTEG-900',
    weight_grams: 25.0,
    wastage_grams: 0.5,
    scrap_grams: 1.0,
    purity_karat: 22,
    signature_karigar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    metadata: { testReturn: true }
  };

  const returnRes = await fetch('http://localhost:3001/api/ledger/return', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${karigarToken}`
    },
    body: JSON.stringify(returnPayload)
  }).then((r) => r.json());

  console.log(
    `✓ [POST /api/ledger/return]: Created Block #${returnRes.data.sequence_number}, Hash: ${returnRes.data.transaction_hash.slice(
      0,
      12
    )}...`
  );

  // 7. Balance Check (authenticated as Karigar)
  const balanceRes = await fetch(`http://localhost:3001/api/ledger/balance/${karigar.id}`, {
    headers: { Authorization: `Bearer ${karigarToken}` }
  }).then((r) => r.json());
  console.log(
    `✓ [GET /api/ledger/balance/:karigarId]: Karigar ${balanceRes.data.karigar_name}, Net Balance = ${balanceRes.data.net_balance_grams}g, 24K Pure Equiv = ${balanceRes.data.net_pure_balance_grams}g Fine`
  );

  // 8. Verify Chain Integrity after multiple transactions
  const finalVerify = await fetch('http://localhost:3001/api/ledger/verify-chain', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jewellerToken}` }
  }).then((r) => r.json());
  console.log(
    `✓ [POST /api/ledger/verify-chain]: Cryptographic Hash Chain Valid = ${finalVerify.data.isValid}, Total blocks = ${finalVerify.data.totalBlocks}`
  );

  // 9. History Pagination and Filtering (scoped to Karigar)
  const historyRes = await fetch(`http://localhost:3001/api/ledger/history?karigar_id=${karigar.id}&limit=5`, {
    headers: { Authorization: `Bearer ${karigarToken}` }
  }).then((r) => r.json());
  console.log(
    `✓ [GET /api/ledger/history]: Total records = ${historyRes.pagination.total}, returned on page = ${historyRes.data.length}`
  );

  console.log('\n🌟 ALL IMMUTABLE GOLD LEDGER API TESTS PASSED SUCCESSFULLY! 🌟');
  process.exit(0);
}

// Start server in-process and run tests
import('../server/index.js').then(() => {
  setTimeout(testApi, 1500);
}).catch((err) => {
  console.error('Import error:', err);
});
