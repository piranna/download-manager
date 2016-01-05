var fs   = require('fs')
var join = require('path').join

var async     = require('async')
var checksum  = require('download-checksum')
var Download  = require('download')
var got       = require('got')
var progress  = require('download-status')
var stripDirs = require('strip-dirs')

var applyPatches = require('diff').applyPatches


const CI = process.env.CI


function getName(item)
{
  return item.name
}

function getNames(downloads)
{
  var names = downloads.map(getName)
  var last  = names.pop()

  var result = names.join(', ')

  if(names.length) result += ' and '

  return result + last
}

function hasAction(item)
{
  return item.patch || item.action
}


function manager(downloads, options, callback)
{
  if(options instanceof Function)
  {
    callback = options
    options = {}
  }

  var deps = options.deps || 'deps'


  function addUrl(item)
  {
    this.get(item.url, join(deps, item.name))
  }

  function getAction(item)
  {
    var action = item.action
    if(action)
    {
      action = action.bind(item)
      if(!item.patch) return action
    }

    return function(callback)
    {
      got(item.patch, function(error, patch)
      {
        if(error) return callback(error)

        var name  = item.name
        var path  = item.path  || ''
        var strip = item.strip || 0

        applyPatches(patch,
        {
          loadFile: function(patch, callback)
          {
            var filename = stripDirs(patch.oldFileName, strip)
            fs.readFile(join(deps, name, path, filename), 'utf8', callback)
          },

          patched: function(patch, content)
          {
            if(content === false)
              return console.error('Context sanity check failed:',patch)

            var filename = stripDirs(patch.newFileName, strip)
            fs.writeFile(join(deps, name, path, filename), content)
          },

          complete: function(error)
          {
            if(error) return callback(error)

            if(action) return action.call(item, callback)

            callback()
          }
        })
      })
    }
  }


  async.reject(downloads, function(item, callback)
  {
    fs.exists(join(deps, item.name), callback)
  },
  function(downloads)
  {
    if(!downloads.length) return callback()

    process.stdout.write('Downloading '+getNames(downloads)+'... ')

    var download = Download({ extract: true, strip: 1 })

    download.use(checksum(downloads))
    if(!CI) download.use(progress())

    downloads.forEach(addUrl, download)

    download.run(function(error)
    {
      if(error) return callback(error)

      if(CI) console.log('Done')

      async.series(downloads.filter(hasAction).map(getAction),callback)
    })
  })
}


module.exports = manager
