(function () {
  const mongoose = require('mongoose')

  const roomSchema = new mongoose.Schema({
    id: String,
    require: String,
    gameState: mongoose.Schema.Types.Mixed
  })

  module.exports = mongoose.model('Room', roomSchema)
})()
