// ==========================================================================
// Rateio de Faturas — Pix (BR Code EMV) e utilitários diversos
// ==========================================================================

// Remove acentos e caracteres especiais, mantém apenas ASCII imprimível
const asciiOnly = s => String(s ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^\x20-\x7E]/g, '');

// Gera payload Pix BR Code (EMV) conforme especificação do Banco Central
function pixEmv({ chave, nome, cidade, valor, txid }) {
  // Monta campos TLV: ID + tamanho (2 dígitos) + valor
  const tlv = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;

  // Campo 26 (merchant account) tem sub-TLVs
  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', chave);

  // Campo 62 (additional data) tem sub-TLV 05 = txid
  const additionalData = tlv('05', txid || '***');

  // Monta payload sem o CRC16 (campo 63)
  let payload = '';
  payload += tlv('00', '01');                    // Payload Format Indicator
  payload += tlv('01', '11');                    // Point of Initiation Method (11 = estático)
  payload += tlv('26', merchantAccount);         // Merchant Account Information
  payload += tlv('52', '0000');                  // MCC (genérico)
  payload += tlv('53', '986');                   // Currency (BRL)
  if (valor && valor > 0) {
    payload += tlv('54', valor.toFixed(2));      // Amount (apenas se > 0)
  }
  payload += tlv('58', 'BR');                    // Country Code
  payload += tlv('59', asciiOnly(nome).slice(0, 25));  // Merchant Name (máx 25)
  payload += tlv('60', asciiOnly(cidade).slice(0, 15)); // Merchant City (máx 15)
  payload += tlv('62', additionalData);          // Additional Data

  // Adiciona o campo 63 com "0000" placeholder para calcular CRC
  const payloadForCrc = payload + '6304';

  // CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflect, xorout 0x0000)
  let crc = 0xFFFF;
  for (let i = 0; i < payloadForCrc.length; i++) {
    crc ^= payloadForCrc.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc = crc << 1;
    }
    crc &= 0xFFFF;
  }
  const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');

  return payload + '6304' + crcHex;
}

// Gera UUID v4 simples para grupo de parcelas
const genUUID = () => crypto.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
  return v.toString(16);
});

export { asciiOnly, pixEmv, genUUID };
