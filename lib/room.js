(function () {
  module.exports = function (mongoose) {
    const roomSchema = new mongoose.Schema({
      id: String,
      require: String,
      gameState: mongoose.Schema.Types.Mixed
    })

    return mongoose.model('Room', roomSchema)
  }
})()
