const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); // Importando o conector do PostgreSQL

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configurando as chaves de acesso ao banco de dados na NUVEM (Neon)
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_ArOy6do4xaLD@ep-frosty-hill-ayg86f1j-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// Testando a conexão com o banco logo ao ligar o servidor
pool.connect()
  .then(() => console.log('✅ Conectado ao banco de dados Turis30 com sucesso!'))
  .catch(err => console.error('❌ Erro ao conectar no banco:', err.stack));

// Rota para TESTE
app.get('/', (req, res) => {
  res.json({ status: 'Sucesso', mensagem: 'A API do Turis30 está online!' });
});

// NOVA ROTA: Ler todos os locais cadastrados (Read)
app.get('/locais', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM pontos_interesse');
    res.json(resultado.rows); // Retorna os dados do banco para o celular
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao buscar os locais' });
  }
});

// NOVA ROTA: Cadastrar um novo local (Create com visitas zeradas)
app.post('/locais', async (req, res) => {
  const { nome, categoria, lat, lon, palavraChave, imagemUrl } = req.body;
  try {
    const query = `
      INSERT INTO pontos_interesse (nome, categoria, lat, lon, palavra_chave, imagem, visitas)
      VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING *;
    `;
    const valores = [nome, categoria, lat, lon, palavraChave, imagemUrl];
    const resultado = await pool.query(query, valores);
    
    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao cadastrar o local' });
  }
});

// NOVA ROTA: Editar um local existente (Update)
app.put('/locais/:id', async (req, res) => {
  const { id } = req.params; // Pega o ID que vem na URL
  const { nome, categoria, palavraChave, imagemUrl } = req.body; // Pega os dados novos
  
  try {
    const query = `
      UPDATE pontos_interesse 
      SET nome = $1, categoria = $2, palavra_chave = $3, imagem = $4
      WHERE id = $5 RETURNING *;
    `;
    const valores = [nome, categoria, palavraChave, imagemUrl, id];
    const resultado = await pool.query(query, valores);
    
    res.json(resultado.rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao atualizar o local' });
  }
});

// NOVA ROTA: Excluir um local (Delete)
app.delete('/locais/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query('DELETE FROM pontos_interesse WHERE id = $1', [id]);
    res.json({ mensagem: 'Estabelecimento excluído com sucesso do banco de dados!' });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao excluir o local' });
  }
});

// ==========================================
// ROTAS: Gerenciamento de Comentários na Nuvem
// ==========================================

// Rota: Buscar comentários de um ponto específico
app.get('/locais/:id/comentarios', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      'SELECT * FROM comentarios WHERE ponto_id = $1 ORDER BY criado_em DESC',
      [id]
    );
    res.json(resultado.rows);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao buscar comentários' });
  }
});

// Rota: Adicionar um novo comentário na nuvem
app.post('/locais/:id/comentarios', async (req, res) => {
  const { id } = req.params;
  const { autor, texto, estrelas } = req.body;
  try {
    const query = `
      INSERT INTO comentarios (ponto_id, autor, texto, estrelas)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const valores = [id, autor, texto, estrelas || 5];
    const resultado = await pool.query(query, valores);
    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao salvar comentário' });
  }
});

// ==========================================
// NOVAS ROTAS: Histórico Temporal de Presenças (Data e Hora)
// ==========================================

// Rota: Registrar um novo check-in temporal e somar nas visitas totais
app.post('/locais/:id/checkin', async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Insere o registro carimbado com data e hora na tabela de histórico
    await pool.query(
      'INSERT INTO historico_presencas (ponto_id) VALUES ($1)',
      [id]
    );

    // 2. Incrementa o contador geral na tabela de pontos de interesse
    const resultadoUpdate = await pool.query(
      'UPDATE pontos_interesse SET visitas = visitas + 1 WHERE id = $1 RETURNING *',
      [id]
    );

    res.status(201).json(resultadoUpdate.rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao registrar check-in temporal' });
  }
});

// Rota: Buscar o histórico de presenças de um ponto (para relatórios analíticos detalhados)
app.get('/locais/:id/historico', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      'SELECT * FROM historico_presencas WHERE ponto_id = $1 ORDER BY data_hora DESC',
      [id]
    );
    res.json(resultado.rows);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao buscar histórico de presenças' });
  }
});

// ==========================================
// NOVAS ROTAS: Stories Efêmeros (24 horas)
// ==========================================

// Rota: Buscar os stories ativos (últimas 24 horas) de um ponto
app.get('/locais/:id/stories', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT * FROM stories_local 
       WHERE ponto_id = $1 
       AND criado_em >= NOW() - INTERVAL '24 hours'
       ORDER BY criado_em DESC`,
      [id]
    );
    res.json(resultado.rows);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao buscar stories' });
  }
});

// Rota: Postar um novo story efêmero
app.post('/locais/:id/stories', async (req, res) => {
  const { id } = req.params;
  const { fotoUrl } = req.body;
  try {
    const query = `
      INSERT INTO stories_local (ponto_id, foto_url)
      VALUES ($1, $2) RETURNING *;
    `;
    const resultado = await pool.query(query, [id, fotoUrl]);
    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao salvar story' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando lisinho na porta http://localhost:${port}`);
});

const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Configura o Cloudinary usando as variáveis de ambiente que você salvou no Render
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Nova rota para salvar o story com foto real
app.post('/locais/:id/stories', upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma foto enviada' });

    // Envia para o Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'stories_turis30' });
    
    // Salva no banco Neon (adapte conforme o seu pool de conexão atual)
    const { id } = req.params;
    await pool.query(
      'INSERT INTO stories_local (local_id, foto_url, data_criacao) VALUES ($1, $2, NOW())',
      [id, result.secure_url]
    );

    res.status(201).json({ url: result.secure_url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao processar upload' });
  }
});