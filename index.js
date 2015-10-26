var fs   = require('fs')
var join = require('path').join

var async    = require('async')
var Download = require('download')
var got      = require('got')
var progress = require('download-status')

var applyPatches = require('diff').applyPatches


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
    if(item.action)
    {
      var action = item.action.bind(item)
      if(!item.patch) return action
    }


    var name = item.name

    return function(callback)
    {
      got(item.patch, function(error, patch)
      {
        if(error) return callback(error)

        applyPatches(patch,
        {
          loadFile: function(patch, callback)
          {
            fs.readFile(join(deps, name, patch.index), 'utf8', callback)
          },

          patched: function(patch, content)
          {
            if(content === false)
              return console.error('Context sanity check failed:',patch)

            fs.writeFile(join(deps, name, patch.index), content)
          },

          complete: function(error)
          {
            if(error) return callback(error)

            if(action) action.call(item, callback)
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
    if(!downloads.length) return

    process.stdout.write('Downloading '+getNames(downloads)+'... ')

    var download = Download({ extract: true, strip: 1 })
    if(!process.env.CI) download.use(progress())

    downloads.forEach(addUrl, download)

    download.run(function(error)
    {
      if(error) return callback(error)

      if(process.env.CI) console.log('Done')

      async.series(downloads.filter(hasAction).map(getAction),callback)
    })
  })
}


module.exports = manager
