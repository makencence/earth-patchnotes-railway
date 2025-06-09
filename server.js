const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // Railway utilise process.env.PORT

app.use(cors());

// Servir les fichiers statiques (pour votre HTML)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/test', (req, res) => {
  res.json({ 
    message: 'Serveur Railway RSS OK', 
    time: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'production'
  });
});

// Route principale pour l'app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/news', async (req, res) => {
  console.log('📰 Récupération automatique actualités françaises...');
  
  try {
    const articles = await fetchAutomaticFrenchNews();
    
    console.log(`✅ ${articles.length} articles automatiquement récupérés`);
    
    res.json({
      status: 'ok',
      totalResults: articles.length,
      articles: articles,
      source: 'Flux RSS français automatiques - Railway',
      timestamp: new Date().toISOString(),
      server: 'Railway'
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    res.status(500).json({
      error: 'Erreur de récupération automatique',
      message: error.message
    });
  }
});

async function fetchAutomaticFrenchNews() {
  console.log('🔄 Récupération depuis flux RSS français...');
  
  // Sources RSS françaises neutres et fiables
  const frenchRSSFeeds = [
    {
      name: 'France Info',
      url: 'https://www.francetvinfo.fr/titres.rss',
      category: 'general',
      neutrality: 'high'
    },
    {
      name: 'Les Échos',
      url: 'https://www.lesechos.fr/rss/rss_une.xml',
      category: 'economie',
      neutrality: 'high'
    },
    {
      name: 'Sciences et Avenir',
      url: 'https://www.sciencesetavenir.fr/rss.xml',
      category: 'science',
      neutrality: 'high'
    },
    {
      name: 'Numerama',
      url: 'https://www.numerama.com/feed/',
      category: 'technologie',
      neutrality: 'high'
    },
    {
      name: 'L\'Équipe',
      url: 'https://www.lequipe.fr/rss/actu_rss.xml',
      category: 'sport',
      neutrality: 'high'
    },
    {
      name: 'Euronews France',
      url: 'https://fr.euronews.com/rss?format=mrss',
      category: 'general',
      neutrality: 'high'
    },
    {
      name: 'RFI',
      url: 'https://www.rfi.fr/fr/rss',
      category: 'general',
      neutrality: 'high'
    },
    {
      name: 'Actu Environnement',
      url: 'https://www.actu-environnement.com/rss/actualites.xml',
      category: 'environnement',
      neutrality: 'high'
    }
  ];
  
  const allArticles = [];
  
  // Parcourir chaque flux RSS
  for (const feed of frenchRSSFeeds) {
    try {
      console.log(`📡 Récupération ${feed.name}...`);
      
      const articles = await fetchRSSFeed(feed);
      
      // Marquer les articles avec leur niveau de neutralité
      const markedArticles = articles.map(article => ({
        ...article,
        neutralityLevel: feed.neutrality,
        isNeutralSource: true
      }));
      
      allArticles.push(...markedArticles);
      
      console.log(`✅ ${feed.name}: ${articles.length} articles`);
      
      // Délai pour éviter de surcharger les serveurs
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.log(`⚠️ Erreur ${feed.name}: ${error.message}`);
    }
  }
  
  // Trier par neutralité puis par date
  const sortedArticles = allArticles
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 30);
  
  console.log(`📊 Total final: ${sortedArticles.length} articles triés`);
  
  return sortedArticles;
}

async function fetchRSSFeed(feed) {
  try {
    const response = await axios.get(feed.url, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EarthPatchnotes/1.0; Railway)'
      }
    });
    
    // Parser le XML RSS
    const parsed = await parseStringPromise(response.data);
    
    let items = [];
    
    // Gérer différents formats RSS
    if (parsed.rss && parsed.rss.channel && parsed.rss.channel[0].item) {
      items = parsed.rss.channel[0].item;
    } else if (parsed.feed && parsed.feed.entry) {
      items = parsed.feed.entry;
    }
    
    // Convertir en format standardisé
    const articles = items.slice(0, 6).map(item => {
      
      let title = '';
      if (item.title && item.title[0]) {
        title = typeof item.title[0] === 'string' ? item.title[0] : item.title[0]._;
      }
      
      let description = '';
      if (item.description && item.description[0]) {
        description = cleanHTML(item.description[0]);
      } else if (item['content:encoded'] && item['content:encoded'][0]) {
        description = cleanHTML(item['content:encoded'][0]);
      } else if (item.summary && item.summary[0]) {
        description = cleanHTML(item.summary[0]);
      }
      
      let link = '';
      if (item.link && item.link[0]) {
        link = typeof item.link[0] === 'string' ? item.link[0] : item.link[0].$.href;
      } else if (item.guid && item.guid[0]) {
        link = typeof item.guid[0] === 'string' ? item.guid[0] : item.guid[0]._;
      }
      
      let pubDate = new Date().toISOString();
      if (item.pubDate && item.pubDate[0]) {
        pubDate = new Date(item.pubDate[0]).toISOString();
      } else if (item.published && item.published[0]) {
        pubDate = new Date(item.published[0]).toISOString();
      }
      
      const category = determineCategory(title + ' ' + description, feed.category);
      
      return {
        title: cleanText(title),
        description: cleanText(description).substring(0, 200) + (description.length > 200 ? '...' : ''),
        url: link,
        source: { name: feed.name },
        publishedAt: pubDate,
        category: category
      };
    });
    
    return articles.filter(article => 
      article.title && 
      article.description && 
      article.url &&
      article.title.length > 10
    );
    
  } catch (error) {
    console.log(`Erreur RSS ${feed.name}:`, error.message);
    return [];
  }
}

function cleanHTML(html) {
  if (!html) return '';
  
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function determineCategory(text, feedCategory) {
  const lowerText = text.toLowerCase();
  
  if (feedCategory !== 'general') {
    return feedCategory;
  }
  
  if (lowerText.includes('technolog') || lowerText.includes('numérique') || lowerText.includes('internet') || lowerText.includes('ia')) {
    return 'technologie';
  } else if (lowerText.includes('économ') || lowerText.includes('bourse') || lowerText.includes('euro') || lowerText.includes('inflation')) {
    return 'economie';
  } else if (lowerText.includes('sport') || lowerText.includes('football') || lowerText.includes('tennis') || lowerText.includes('olympi')) {
    return 'sport';
  } else if (lowerText.includes('scienc') || lowerText.includes('recherch') || lowerText.includes('étude') || lowerText.includes('médecin')) {
    return 'science';
  } else if (lowerText.includes('cultur') || lowerText.includes('cinéma') || lowerText.includes('musique') || lowerText.includes('festival')) {
    return 'culture';
  } else if (lowerText.includes('climat') || lowerText.includes('environn') || lowerText.includes('écolog') || lowerText.includes('carbone')) {
    return 'environnement';
  } else {
    return 'politique';
  }
}

// Route pour voir les sources
app.get('/sources', (req, res) => {
  res.json({
    message: 'Sources RSS françaises neutrales - Railway',
    sources: [
      { name: 'France Info', neutrality: 'high', type: 'Service public' },
      { name: 'Les Échos', neutrality: 'high', type: 'Économie spécialisée' },
      { name: 'Sciences et Avenir', neutrality: 'high', type: 'Scientifique' },
      { name: 'Numerama', neutrality: 'high', type: 'Technologie' },
      { name: 'L\'Équipe', neutrality: 'high', type: 'Sport' },
      { name: 'Euronews', neutrality: 'high', type: 'Européen' },
      { name: 'RFI', neutrality: 'high', type: 'International' },
      { name: 'Actu Environnement', neutrality: 'high', type: 'Environnement' }
    ],
    total_sources: 8,
    server: 'Railway',
    real_time: true
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur Earth Patchnotes Railway démarré sur port ${PORT}`);
  console.log('📰 Sources RSS françaises neutres automatiques');
  console.log('🔄 Récupération temps réel des flux RSS');
  console.log('💰 100% gratuit sur Railway');
  console.log('🌍 Accessible mondialement');
  console.log('');
});