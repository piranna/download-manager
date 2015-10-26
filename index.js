var exists = require('fs').exists
var join   = require('path').join

var async    = require('async')
var Download = require('download')
var progress = require('download-status')


function getName(item)
{
  return item.name
}

function getAction(item)
{
  return item.action.bind(item)
}

function getNames(downloads)
{
  var names = downloads.map(getName)
  var last  = names.pop()

  var result = names.join(', ')

  if(names.length) result += ' and '

  return result + last
}

function notUndefinedAction(item)
{
  return item.action !== undefined
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


  async.reject(downloads, function(item, callback)
  {
    exists(join(deps, item.name), callback)
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

      async.series(downloads.filter(notUndefinedAction).map(getAction),callback)
    })
  })
}


module.exports = manager
