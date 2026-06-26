// /api/views.js
// Vercel Serverless Function — consulta o GA4 Data API e retorna
// visualizações por página dos últimos N dias, para reordenar o blog.
//
// Variáveis de ambiente necessárias no Vercel (Project Settings > Environment Variables):
//   GA4_PROPERTY_ID            -> ID numérico da propriedade GA4 (ex: 123456789, SEM "properties/")
//   GA4_CLIENT_EMAIL           -> e-mail da service account (termina em @...iam.gserviceaccount.com)
//   GA4_PRIVATE_KEY            -> chave privada da service account (cole o conteúdo entre
//                                  -----BEGIN PRIVATE KEY----- e -----END PRIVATE KEY-----,
//                                  mantendo as quebras de linha como \n)

const { GoogleAuth } = require('google-auth-library');

const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];
const DAYS_WINDOW = 30; // janela de dados: últimos 30 dias
const CACHE_SECONDS = 3600; // cache de 1 hora — evita bater na cota do GA4 a cada visita

let cachedAuthClient = null;

function getAuthClient() {
  if (cachedAuthClient) return cachedAuthClient;

  const privateKey = (process.env.GA4_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  cachedAuthClient = new GoogleAuth({
    credentials: {
      client_email: process.env.GA4_CLIENT_EMAIL,
      private_key: privateKey,
    },
    scopes: SCOPES,
  });

  return cachedAuthClient;
}

async function fetchGA4Report() {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error('GA4_PROPERTY_ID não configurado');

  const auth = getAuthClient();
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  const body = {
    dateRanges: [{ startDate: `${DAYS_WINDOW}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'BEGINS_WITH', value: '/blog/' },
      },
    },
    limit: 200,
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GA4 API retornou ${res.status}: ${errText}`);
  }

  return res.json();
}

function normalizeSlug(pagePath) {
  // Remove barra inicial/final e o prefixo "blog/", deixando só o slug do artigo.
  return pagePath
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/^blog\//, '');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`);
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const data = await fetchGA4Report();
    const rows = data.rows || [];

    const views = {};
    for (const row of rows) {
      const pagePath = row.dimensionValues?.[0]?.value || '';
      const count = parseInt(row.metricValues?.[0]?.value || '0', 10);
      const slug = normalizeSlug(pagePath);
      if (!slug) continue;
      // Soma caso a mesma rota apareça mais de uma vez (ex: com/sem barra final)
      views[slug] = (views[slug] || 0) + count;
    }

    res.status(200).json({ ok: true, days: DAYS_WINDOW, views });
  } catch (err) {
    console.error('Erro ao consultar GA4:', err.message);
    // Falha graciosamente: retorna lista vazia, o blog.html mantém a ordem padrão
    res.status(200).json({ ok: false, error: err.message, views: {} });
  }
};
