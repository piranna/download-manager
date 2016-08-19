const assert       = require('assert')
const readFileSync = require('fs').readFileSync

const manager = require('../..')


// Source versions

const BINUTILS_VERSION = "2.26"
const GCC_VERSION      = "5.3.0"
const LINUX_VERSION    = "4.6"
const MUSL_VERSION     = "1.1.14"


// Source URLs

const BINUTILS_URL = "http://ftpmirror.gnu.org/binutils/binutils-"+BINUTILS_VERSION+".tar.gz"
const GCC_URL      = "http://ftpmirror.gnu.org/gcc/gcc-"+GCC_VERSION+"/gcc-"+GCC_VERSION+".tar.gz"
const LINUX_URL    = "https://www.kernel.org/pub/linux/kernel/v4.x/linux-"+LINUX_VERSION+".tar.gz"
const MUSL_URL     = "http://www.musl-libc.org/releases/musl-"+MUSL_VERSION+".tar.gz"


// Checksums

const LINUX_SHA256 = 'cca08a5bba56d38dd94332f3927d52889231184ba20081f0bf612d32985d5ff5'


// Patch GCC to work with musl
const GCC_PATCH_URL = 'https://raw.githubusercontent.com/GregorR/musl-cross/master/patches/gcc-'+GCC_VERSION+'-musl.diff'


// Patch Linux to use GLIBC headers
const LINUX_PATCH_PATH = 'test/integration/linux-'+LINUX_VERSION+'.diff'


//
// binutils, gcc, Linux & musl
//

var downloads =
[
  {
    name: 'binutils',
    url: BINUTILS_URL
  },
  {
    name: 'gcc',
    url: GCC_URL,
    patch: GCC_PATCH_URL,
    strip: 1
  },
  {
    name: 'linux',
    url: LINUX_URL,
    patch: LINUX_PATCH_PATH,
    sha256: LINUX_SHA256
  },
  {
    name: 'musl',
    url: MUSL_URL
   }
]


it('complex', function(done)
{
  this.timeout(0)

  manager(downloads, {path: 'tmp'}, function(error)
  {
    assert.ifError(error)

    var index = readFileSync('tmp/linux/Makefile', 'utf8')
                .indexOf('-I../glibc')
    assert.notStrictEqual(index, -1)

    var index = readFileSync('tmp/gcc/libstdc++-v3/configure.host', 'utf8')
                .indexOf('musl')
    assert.notStrictEqual(index, -1)

    done()
  })
})
