const express = require('express');
const { pool } = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const JOURS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

// GET /api/pilotage/:semaine
router.get('/:semaine', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM pilotage WHERE user_id=$1 AND semaine=$2 ORDER BY
        CASE jour WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3
                  WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 END`,
      [req.userId, req.params.semaine]
    );
    // Retourne les 6 jours meme si certains n'ont pas encore de donnees
    const map = {};
    result.rows.forEach(r => { map[r.jour] = r; });
    const data = JOURS.map(j => map[j] || {
      jour: j, semaine: req.params.semaine,
      zone: '', clients_visiter: '', objectif: 0, realise: 0, note: ''
    });
    res.json(data);
  } catch (err) {
    console.error('GET pilotage:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/pilotage/:semaine  (upsert de tous les jours en une fois)
router.put('/:semaine', async (req, res) => {
  const { semaine } = req.params;
  const { jours } = req.body; // tableau de 6 objets

  if (!Array.isArray(jours))
    return res.status(400).json({ error: 'jours doit etre un tableau' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saved = [];
    for (const j of jours) {
      if (!JOURS.includes(j.jour)) continue;
      const result = await client.query(
        `INSERT INTO pilotage (user_id, semaine, jour, zone, clients_visiter, objectif, realise, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id, semaine, jour)
         DO UPDATE SET zone=$4, clients_visiter=$5, objectif=$6, realise=$7, note=$8
         RETURNING *`,
        [req.userId, semaine, j.jour,
         j.zone || null, j.clients_visiter || null,
         +j.objectif || 0, +j.realise || 0, j.note || null]
      );
      saved.push(result.rows[0]);
    }
    await client.query('COMMIT');
    res.json(saved);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT pilotage:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// GET /api/pilotage/:semaine/actions
router.get('/:semaine/actions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM actions_correctives WHERE user_id=$1 AND semaine=$2',
      [req.userId, req.params.semaine]
    );
    res.json(result.rows[0] || { semaine: req.params.semaine, contenu: '' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/pilotage/:semaine/actions
router.put('/:semaine/actions', async (req, res) => {
  try {
    const { contenu } = req.body;
    const result = await pool.query(
      `INSERT INTO actions_correctives (user_id, semaine, contenu)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, semaine)
       DO UPDATE SET contenu=$3 RETURNING *`,
      [req.userId, req.params.semaine, contenu || '']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
