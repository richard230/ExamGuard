const express = require('express');
const router = express.Router();
const Parent = require('../models/Parent');

/**
 * GET all parents
 */
router.get('/', async (req, res) => {
  try {
    const parents = await Parent.find().sort({ name: 1 });
    res.json(parents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET parent by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id);
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    res.json(parent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * CREATE parent
 */
router.post('/', async (req, res) => {
  try {
    const parent = await Parent.create(req.body);
    res.status(201).json(parent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * UPDATE parent
 */
router.patch('/:id', async (req, res) => {
  try {
    const parent = await Parent.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    res.json(parent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE parent
 */
router.delete('/:id', async (req, res) => {
  try {
    const parent = await Parent.findByIdAndDelete(req.params.id);
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    res.json({ message: 'Parent deleted successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
