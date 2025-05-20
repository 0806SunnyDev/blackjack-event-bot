const mongoose = require('mongoose');

const DepositSchema = new mongoose.Schema({
  block: { type: Number, required: true, unique: true },
});

module.exports = mongoose.model('Deposit', DepositSchema);