// /api/debug-env.js
// Endpoint TEMPORÁRIO de diagnóstico.
// Mostra o que a função enxerga das variáveis de ambiente do GA4,
// SEM expor segredos (só presença, tamanho e os nomes das chaves).
// Depois de diagnosticar, apague este arquivo do repositório.

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); // nunca cacheia
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Lista TODAS as chaves de ambiente que contenham "GA4" no nome.
  // Revela typos/espaços invisíveis no nome da variável.
  const ga4KeysEncontradas = Object.keys(process.env)
    .filter((k) => k.toUpperCase().includes('GA4'));

  const out = {
    ga4_keys_encontradas: ga4KeysEncontradas,
    detalhe: {},
  };

  ['GA4_PROPERTY_ID', 'GA4_CLIENT_EMAIL', 'GA4_PRIVATE_KEY'].forEach((k) => {
    const v = process.env[k];
    const presente = typeof v === 'string' && v.length > 0;
    out.detalhe[k] = {
      presente: presente,
      tamanho: v ? v.length : 0,
      // Property ID e e-mail não são segredos: mostro pra conferência.
      // Chave privada: só os primeiros caracteres, pra confirmar o formato.
      valor:
        k === 'GA4_PRIVATE_KEY'
          ? (v ? v.slice(0, 30) + '...' : null)
          : (v || null),
    };
  });

  res.status(200).json(out);
};
