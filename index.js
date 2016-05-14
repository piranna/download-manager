var fs   = require('fs')
var path = require('path')

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
    this.get(item.url, path.join(deps, item.name))
  }

  function getAction(item)
  {
    var patch = item.patch

    var action = item.action
    if(action)
    {
      action = action.bind(item)
      if(!patch) return action
    }

    var name  = item .name
    var path  = patch.path  || item.path  || ''
    var strip = patch.strip || item.strip || 0
    var url   = patch.url   || patch

    function loadFile(patch, callback)
    {
      const fileName = patch.oldFileName

      if(!path.isAbsolute(fileName)) filename = stripDirs(oldFileName, strip)

      fs.readFile(path.join(deps, name, path, filename), 'utf8', callback)
    }

    function patched(patch, content)
    {
      if(content === false)
        return console.error('Context sanity check failed:',patch)

      const fileName = patch.newFileName

      if(!path.isAbsolute(fileName)) filename = stripDirs(oldFileName, strip)

      fs.writeFile(path.join(deps, name, path, filename), content)
    }

    return function(callback)
    {
      function complete(error)
      {
        if(error) return callback(error)

        if(action) return action.call(item, callback)

        callback()
      }

      got(url, function(error, patch)
      {
        if(error) return callback(error)

        applyPatches(patch,
        {
          loadFile: loadFile,
          patched : patched,
          complete: complete
        })
      })
    }
  }


  async.reject(downloads, function(item, callback)
  {
    fs.exists(path.join(deps, item.name), callback)
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
