(function () {
  const discordjs = require('discord.js')
  class GameRooms {
    constructor (options) {
      this.client = options.client
      this.mongoose = options.mongoose
      this.Room = require('./room')(options.mongoose)
    }
  }

  GameRooms.prototype.init = async function (client) {
    let rooms = await this.Room.find({})
    rooms.map((room) => {
      this.setupRoom(room.id, room.require, client)
    })
  }

  GameRooms.prototype.invitePlayers = async function (msg, gamePath, joinReact = '👍') {
    let details = require(gamePath).details
    if (details === null || details === undefined) {
      details = {
        intro: 'Who wants in?'
      }
    }

    let prompt = await msg.channel.send(`${details.invite}\nReact with ${joinReact} to join this game.`)
    prompt.react(joinReact)
    let reactions = await prompt.awaitReactions((reaction) => {
      return reaction.emoji.name === joinReact
    }, {maxUsers: details.players.max + 1, time: 10000})

    const users = reactions.first().users.filter((u) => { return u.id !== msg.client.user.id }).array()
    if (users.length < details.players.min) {
      return msg.reply(`${details.title} requires at least ${details.players.min} players, sorry`)
    }

    let room = await this.createGameRoom(msg, users, 'testroom', gamePath)
    return msg.channel.send(`${users.join(', ')}: your game is ready for you in ${room.toString()}`)
  }

  GameRooms.prototype.createGameRoom = async function (msg, users, name, requirePath) {
    // give all players access
    let overwrites = []
    let players = []
    let readwrite = new discordjs.Permissions(['READ_MESSAGES', 'SEND_MESSAGES']).bitfield
    users.map((user) => {
      overwrites.push({
        id: user.id,
        type: 'member',
        allow: readwrite
      })
      players.push(user.toString())
    })

    overwrites.push({
      id: msg.client.user.id,
      type: 'member',
      allow: readwrite
    })

    overwrites.push({
      id: msg.guild.defaultRole.id,
      type: 'role',
      deny: 1024
    })

    let discriminator = Math.floor(Math.random() * 1000)

    // create a room
    try {
      let Game = require(requirePath)
      var game
      if (Game.init === undefined) {
        game = new Game()
      } else {
        game = Game
      }

      if (game === undefined || game === null) {
        throw new Error(`Game ${requirePath} not found!`)
      }

      const room = await msg.guild.createChannel(`${name}-${discriminator}`, 'text', overwrites)
      let init = game.init(players)
      room.send(`Welcome! All commands sent to me in this channel will be sent to the game. Have fun!\n${game.details.intro}`)
      room.send(init.message)
      this.setupRoom(room.id, requirePath, msg.client, true)
      const roomObj = new this.Room({
        id: room.id,
        require: requirePath,
        gameState: init.gameState
      })

      roomObj.save().catch((e) => { throw e })

      return room
    } catch (err) {
      throw err
    }
  }

  GameRooms.prototype.createGameRoomInhibitor = function (roomId, gameRequire) {
    return (message) => {
      if (message.channel.id === roomId) {
        const prefix = message.guild ? message.guild.commandPrefix : this.client.commandPrefix
        const content = message.content.substring(prefix.length).trim()
        this.Room.findOne({id: roomId}).then(async (room) => {
          if (room.gameState === undefined || room.gameState === null) {
            room.gameState = {}
          }

          try {
            let result = require(gameRequire).run(message.author.toString(), content, room.gameState)
            if (result.gameState === false || result === false) {
              if (result.message !== undefined) {
                message.say(result.message)
              }
              return this.deleteGameRoom(roomId, message.client, message.guild)
            }

            if (result === null || result === undefined || result.gameState === null || result.gameState === undefined) {
              throw new Error('The game state was not returned')
            }

            room.gameState = result.gameState
            room.markModified('gameState')
            room.save().catch((err) => { throw err })

            return message.say(result.message)
          } catch (err) {
            throw err
          }
        }).catch((err) => {
          return message.say(`\`\`\`${err.stack}\`\`\`\n\nPlease report this to an admin. (Room ID: ${roomId})`)
        })

        return true
      }

      return false
    }
  }

  GameRooms.prototype.setupRoom = function (roomId, gameRequire, client, first = false) {
    if (!client.channels.has(roomId)) {
      return this.deleteGameRoom(roomId, client)
    }

    // inhibit commands in this room
    let inhibitor = this.createGameRoomInhibitor(roomId, gameRequire)

    client.gamerooms[roomId] = inhibitor
    client.dispatcher.addInhibitor(inhibitor)
    if (!first) {
      client.channels.get(roomId).send('Please, continue...')
    }

    console.log('gameroom: roomId', roomId)
  }

  GameRooms.prototype.deleteGameRoom = function (roomId, client, guild) {
    let inhibitor = client.gamerooms[roomId]
    if (typeof inhibitor === 'function') {
      client.dispatcher.removeInhibitor(inhibitor)
    }

    delete client.gamerooms[roomId]
    if (guild) {
      let room = guild.channels.get(roomId)
      room.send('Thanks for playing, the room will be deleted in 10 seconds')
    }
    setTimeout(() => {
      this.Room.findOneAndRemove({id: roomId}).then((err) => {
        if (guild) {
          let room = guild.channels.get(roomId)
          room.delete()
        }

        if (err) {
          console.error(err)
        }

        console.log('closed room', roomId)
      })
    }, 10000)
  }

  module.exports = GameRooms
})()
