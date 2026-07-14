// Make npm "buffer" & "process" available in browsers
import { Buffer as BufferPolyfill } from './buffer.cjs';

// Set globals once (side effect)
const g = globalThis;
if (typeof g.Buffer === 'undefined') g.Buffer = BufferPolyfill;

var Binaryen = (() => {
  var _scriptName = import.meta.url;

  return async function (moduleArg = {}) {
    var moduleRtn;

    var a = moduleArg,
      aa,
      ba,
      ca = new Promise((b, c) => {
        aa = b;
        ba = c;
      }),
      da = 'object' == typeof window,
      ea = 'function' == typeof importScripts,
      fa = Object.assign({}, a),
      ha = './this.program',
      ia = (b, c) => {
        throw c;
      },
      e = '',
      ja,
      ka;
    if (da || ea)
      (ea
        ? (e = self.location.href)
        : 'undefined' != typeof document &&
          document.currentScript &&
          (e = document.currentScript.src),
        _scriptName && (e = _scriptName),
        e.startsWith('blob:')
          ? (e = '')
          : (e = e.substr(0, e.replace(/[?#].*/, '').lastIndexOf('/') + 1)),
        ea &&
          (ka = b => {
            var c = new XMLHttpRequest();
            c.open('GET', b, !1);
            c.responseType = 'arraybuffer';
            c.send(null);
            return new Uint8Array(c.response);
          }),
        (ja = b =>
          fetch(b, { credentials: 'same-origin' }).then(c =>
            c.ok ? c.arrayBuffer() : Promise.reject(Error(c.status + ' : ' + c.url))
          )));
    var m = a.print || console.log.bind(console),
      la = a.printErr || console.error.bind(console);
    Object.assign(a, fa);
    fa = null;
    a.thisProgram && (ha = a.thisProgram);
    a.quit && (ia = a.quit);
    var ma;
    a.wasmBinary && (ma = a.wasmBinary);
    var na,
      oa = !1,
      n,
      u,
      pa,
      v,
      w;
    function qa() {
      var b = na.buffer;
      a.HEAP8 = n = new Int8Array(b);
      a.HEAP16 = pa = new Int16Array(b);
      a.HEAPU8 = u = new Uint8Array(b);
      a.HEAPU16 = new Uint16Array(b);
      a.HEAP32 = v = new Int32Array(b);
      a.HEAPU32 = w = new Uint32Array(b);
      a.HEAPF32 = new Float32Array(b);
      a.HEAPF64 = new Float64Array(b);
    }
    var ra = [],
      sa = [],
      ta = [],
      ua = !1;
    function va() {
      var b = a.preRun.shift();
      ra.unshift(b);
    }
    var wa = 0,
      xa = null,
      ya = null;
    function za() {
      wa++;
      a.monitorRunDependencies?.(wa);
    }
    function Aa() {
      wa--;
      a.monitorRunDependencies?.(wa);
      if (0 == wa && (null !== xa && (clearInterval(xa), (xa = null)), ya)) {
        var b = ya;
        ya = null;
        b();
      }
    }
    function x(b) {
      a.onAbort?.(b);
      b = 'Aborted(' + b + ')';
      la(b);
      oa = !0;
      b = new WebAssembly.RuntimeError(b + '. Build with -sASSERTIONS for more info.');
      ba(b);
      throw b;
    }
    var Ba = b => b.startsWith('data:application/octet-stream;base64,'),
      Ca;
    function Da(b) {
      if (b == Ca && ma) return new Uint8Array(ma);
      if (ka) return ka(b);
      throw 'both async and sync fetching of the wasm failed';
    }
    function Ea(b) {
      return ma
        ? Promise.resolve().then(() => Da(b))
        : ja(b).then(
            c => new Uint8Array(c),
            () => Da(b)
          );
    }
    function Fa(b, c, g) {
      return Ea(b)
        .then(d => WebAssembly.instantiate(d, c))
        .then(g, d => {
          la(`failed to asynchronously prepare wasm: ${d}`);
          x(d);
        });
    }
    function Ga(b, c) {
      var g = Ca;
      return ma ||
        'function' != typeof WebAssembly.instantiateStreaming ||
        Ba(g) ||
        'function' != typeof fetch
        ? Fa(g, b, c)
        : fetch(g, { credentials: 'same-origin' }).then(d =>
            WebAssembly.instantiateStreaming(d, b).then(c, function (f) {
              la(`wasm streaming compile failed: ${f}`);
              la('falling back to ArrayBuffer instantiation');
              return Fa(g, b, c);
            })
          );
    }
    var Ha, Ia;
    function Ja(b) {
      this.name = 'ExitStatus';
      this.message = `Program terminated with exit(${b})`;
      this.status = b;
    }
    var Ka = b => {
        for (; 0 < b.length; ) b.shift()(a);
      },
      La = a.noExitRuntime || !0,
      Ma = [],
      Na = 0,
      Oa = 0;
    function Pa(b, c, g) {
      w[(b.DC + 16) >> 2] = 0;
      w[(b.DC + 4) >> 2] = c;
      w[(b.DC + 8) >> 2] = g;
    }
    function Qa(b) {
      if (Ra(w[(b.DC + 4) >> 2])) return w[b.PC >> 2];
      var c = w[(b.DC + 16) >> 2];
      return 0 !== c ? c : b.PC;
    }
    class Sa {
      constructor(b) {
        this.PC = b;
        this.DC = b - 24;
      }
    }
    var Va = b => {
      var c = Oa;
      if (!c) return (Ta(0), 0);
      var g = new Sa(c);
      w[(g.DC + 16) >> 2] = c;
      var d = w[(g.DC + 4) >> 2];
      if (!d) return (Ta(0), c);
      for (var f of b) {
        if (0 === f || f === d) break;
        if (Ua(f, d, g.DC + 16)) return (Ta(f), c);
      }
      Ta(d);
      return c;
    };
    function Wa() {
      var b = v[+Xa >> 2];
      Xa += 4;
      return b;
    }
    var Ya = (b, c) => {
        for (var g = 0, d = b.length - 1; 0 <= d; d--) {
          var f = b[d];
          '.' === f
            ? b.splice(d, 1)
            : '..' === f
              ? (b.splice(d, 1), g++)
              : g && (b.splice(d, 1), g--);
        }
        if (c) for (; g; g--) b.unshift('..');
        return b;
      },
      Za = b => {
        var c = '/' === b.charAt(0),
          g = '/' === b.substr(-1);
        (b = Ya(
          b.split('/').filter(d => !!d),
          !c
        ).join('/')) ||
          c ||
          (b = '.');
        b && g && (b += '/');
        return (c ? '/' : '') + b;
      },
      $a = b => {
        var c = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(b).slice(1);
        b = c[0];
        c = c[1];
        if (!b && !c) return '.';
        c &&= c.substr(0, c.length - 1);
        return b + c;
      },
      ab = b => {
        if ('/' === b) return '/';
        b = Za(b);
        b = b.replace(/\/$/, '');
        var c = b.lastIndexOf('/');
        return -1 === c ? b : b.substr(c + 1);
      },
      bb = () => {
        if ('object' == typeof crypto && 'function' == typeof crypto.getRandomValues)
          return b => crypto.getRandomValues(b);
        x('initRandomDevice');
      },
      cb = b => (cb = bb())(b),
      db = (...b) => {
        for (var c = '', g = !1, d = b.length - 1; -1 <= d && !g; d--) {
          g = 0 <= d ? b[d] : '/';
          if ('string' != typeof g)
            throw new TypeError('Arguments to path.resolve must be strings');
          if (!g) return '';
          c = g + '/' + c;
          g = '/' === g.charAt(0);
        }
        c = Ya(
          c.split('/').filter(f => !!f),
          !g
        ).join('/');
        return (g ? '/' : '') + c || '.';
      },
      fb = 'undefined' != typeof TextDecoder ? new TextDecoder() : void 0,
      y = (b, c) => {
        for (var g = c + NaN, d = c; b[d] && !(d >= g); ) ++d;
        if (16 < d - c && b.buffer && fb) return fb.decode(b.subarray(c, d));
        for (g = ''; c < d; ) {
          var f = b[c++];
          if (f & 128) {
            var h = b[c++] & 63;
            if (192 == (f & 224)) g += String.fromCharCode(((f & 31) << 6) | h);
            else {
              var k = b[c++] & 63;
              f =
                224 == (f & 240)
                  ? ((f & 15) << 12) | (h << 6) | k
                  : ((f & 7) << 18) | (h << 12) | (k << 6) | (b[c++] & 63);
              65536 > f
                ? (g += String.fromCharCode(f))
                : ((f -= 65536), (g += String.fromCharCode(55296 | (f >> 10), 56320 | (f & 1023))));
            }
          } else g += String.fromCharCode(f);
        }
        return g;
      },
      gb = [],
      hb = b => {
        for (var c = 0, g = 0; g < b.length; ++g) {
          var d = b.charCodeAt(g);
          127 >= d
            ? c++
            : 2047 >= d
              ? (c += 2)
              : 55296 <= d && 57343 >= d
                ? ((c += 4), ++g)
                : (c += 3);
        }
        return c;
      },
      ib = (b, c, g, d) => {
        if (!(0 < d)) return 0;
        var f = g;
        d = g + d - 1;
        for (var h = 0; h < b.length; ++h) {
          var k = b.charCodeAt(h);
          if (55296 <= k && 57343 >= k) {
            var l = b.charCodeAt(++h);
            k = (65536 + ((k & 1023) << 10)) | (l & 1023);
          }
          if (127 >= k) {
            if (g >= d) break;
            c[g++] = k;
          } else {
            if (2047 >= k) {
              if (g + 1 >= d) break;
              c[g++] = 192 | (k >> 6);
            } else {
              if (65535 >= k) {
                if (g + 2 >= d) break;
                c[g++] = 224 | (k >> 12);
              } else {
                if (g + 3 >= d) break;
                c[g++] = 240 | (k >> 18);
                c[g++] = 128 | ((k >> 12) & 63);
              }
              c[g++] = 128 | ((k >> 6) & 63);
            }
            c[g++] = 128 | (k & 63);
          }
        }
        c[g] = 0;
        return g - f;
      };
    function jb(b) {
      var c = Array(hb(b) + 1);
      b = ib(b, c, 0, c.length);
      c.length = b;
      return c;
    }
    var kb = [];
    function lb(b, c) {
      kb[b] = { input: [], EC: [], IC: c };
      mb(b, nb);
    }
    var nb = {
        open(b) {
          var c = kb[b.node.VC];
          if (!c) throw new z(43);
          b.BC = c;
          b.seekable = !1;
        },
        close(b) {
          b.BC.IC.TC(b.BC);
        },
        TC(b) {
          b.BC.IC.TC(b.BC);
        },
        read(b, c, g, d) {
          if (!b.BC || !b.BC.IC.lD) throw new z(60);
          for (var f = 0, h = 0; h < d; h++) {
            try {
              var k = b.BC.IC.lD(b.BC);
            } catch (l) {
              throw new z(29);
            }
            if (void 0 === k && 0 === f) throw new z(6);
            if (null === k || void 0 === k) break;
            f++;
            c[g + h] = k;
          }
          f && (b.node.timestamp = Date.now());
          return f;
        },
        write(b, c, g, d) {
          if (!b.BC || !b.BC.IC.bD) throw new z(60);
          try {
            for (var f = 0; f < d; f++) b.BC.IC.bD(b.BC, c[g + f]);
          } catch (h) {
            throw new z(29);
          }
          d && (b.node.timestamp = Date.now());
          return f;
        },
      },
      ob = {
        lD() {
          a: {
            if (!gb.length) {
              var b = null;
              'undefined' != typeof window &&
                'function' == typeof window.prompt &&
                ((b = window.prompt('Input: ')), null !== b && (b += '\n'));
              if (!b) {
                b = null;
                break a;
              }
              gb = jb(b);
            }
            b = gb.shift();
          }
          return b;
        },
        bD(b, c) {
          null === c || 10 === c ? (m(y(b.EC, 0)), (b.EC = [])) : 0 != c && b.EC.push(c);
        },
        TC(b) {
          b.EC && 0 < b.EC.length && (m(y(b.EC, 0)), (b.EC = []));
        },
        vD() {
          return {
            HD: 25856,
            JD: 5,
            GD: 191,
            ID: 35387,
            FD: [
              3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              0, 0, 0, 0, 0, 0, 0,
            ],
          };
        },
        wD() {
          return 0;
        },
        xD() {
          return [24, 80];
        },
      },
      pb = {
        bD(b, c) {
          null === c || 10 === c ? (la(y(b.EC, 0)), (b.EC = [])) : 0 != c && b.EC.push(c);
        },
        TC(b) {
          b.EC && 0 < b.EC.length && (la(y(b.EC, 0)), (b.EC = []));
        },
      };
    function qb(b, c) {
      var g = b.yC ? b.yC.length : 0;
      g >= c ||
        ((c = Math.max(c, (g * (1048576 > g ? 2 : 1.125)) >>> 0)),
        0 != g && (c = Math.max(c, 256)),
        (g = b.yC),
        (b.yC = new Uint8Array(c)),
        0 < b.CC && b.yC.set(g.subarray(0, b.CC), 0));
    }
    var B = {
        GC: null,
        HC() {
          return B.createNode(null, '/', 16895, 0);
        },
        createNode(b, c, g, d) {
          if (24576 === (g & 61440) || 4096 === (g & 61440)) throw new z(63);
          B.GC ||
            (B.GC = {
              dir: {
                node: {
                  MC: B.zC.MC,
                  FC: B.zC.FC,
                  QC: B.zC.QC,
                  UC: B.zC.UC,
                  qD: B.zC.qD,
                  XC: B.zC.XC,
                  rD: B.zC.rD,
                  pD: B.zC.pD,
                  WC: B.zC.WC,
                },
                stream: { NC: B.AC.NC },
              },
              file: {
                node: { MC: B.zC.MC, FC: B.zC.FC },
                stream: {
                  NC: B.AC.NC,
                  read: B.AC.read,
                  write: B.AC.write,
                  iD: B.AC.iD,
                  aD: B.AC.aD,
                  oD: B.AC.oD,
                },
              },
              link: { node: { MC: B.zC.MC, FC: B.zC.FC, SC: B.zC.SC }, stream: {} },
              jD: { node: { MC: B.zC.MC, FC: B.zC.FC }, stream: rb },
            });
          g = sb(b, c, g, d);
          C(g.mode)
            ? ((g.zC = B.GC.dir.node), (g.AC = B.GC.dir.stream), (g.yC = {}))
            : 32768 === (g.mode & 61440)
              ? ((g.zC = B.GC.file.node), (g.AC = B.GC.file.stream), (g.CC = 0), (g.yC = null))
              : 40960 === (g.mode & 61440)
                ? ((g.zC = B.GC.link.node), (g.AC = B.GC.link.stream))
                : 8192 === (g.mode & 61440) && ((g.zC = B.GC.jD.node), (g.AC = B.GC.jD.stream));
          g.timestamp = Date.now();
          b && ((b.yC[c] = g), (b.timestamp = g.timestamp));
          return g;
        },
        OD(b) {
          return b.yC
            ? b.yC.subarray
              ? b.yC.subarray(0, b.CC)
              : new Uint8Array(b.yC)
            : new Uint8Array(0);
        },
        zC: {
          MC(b) {
            var c = {};
            c.LD = 8192 === (b.mode & 61440) ? b.id : 1;
            c.QD = b.id;
            c.mode = b.mode;
            c.SD = 1;
            c.uid = 0;
            c.PD = 0;
            c.VC = b.VC;
            C(b.mode)
              ? (c.size = 4096)
              : 32768 === (b.mode & 61440)
                ? (c.size = b.CC)
                : 40960 === (b.mode & 61440)
                  ? (c.size = b.link.length)
                  : (c.size = 0);
            c.DD = new Date(b.timestamp);
            c.RD = new Date(b.timestamp);
            c.KD = new Date(b.timestamp);
            c.tD = 4096;
            c.ED = Math.ceil(c.size / c.tD);
            return c;
          },
          FC(b, c) {
            void 0 !== c.mode && (b.mode = c.mode);
            void 0 !== c.timestamp && (b.timestamp = c.timestamp);
            if (void 0 !== c.size && ((c = c.size), b.CC != c))
              if (0 == c) ((b.yC = null), (b.CC = 0));
              else {
                var g = b.yC;
                b.yC = new Uint8Array(c);
                g && b.yC.set(g.subarray(0, Math.min(c, b.CC)));
                b.CC = c;
              }
          },
          QC() {
            throw tb[44];
          },
          UC(b, c, g, d) {
            return B.createNode(b, c, g, d);
          },
          qD(b, c, g) {
            if (C(b.mode)) {
              try {
                var d = ub(c, g);
              } catch (h) {}
              if (d) for (var f in d.yC) throw new z(55);
            }
            delete b.parent.yC[b.name];
            b.parent.timestamp = Date.now();
            b.name = g;
            c.yC[g] = b;
            c.timestamp = b.parent.timestamp;
          },
          XC(b, c) {
            delete b.yC[c];
            b.timestamp = Date.now();
          },
          rD(b, c) {
            var g = ub(b, c),
              d;
            for (d in g.yC) throw new z(55);
            delete b.yC[c];
            b.timestamp = Date.now();
          },
          pD(b) {
            var c = ['.', '..'],
              g;
            for (g of Object.keys(b.yC)) c.push(g);
            return c;
          },
          WC(b, c, g) {
            b = B.createNode(b, c, 41471, 0);
            b.link = g;
            return b;
          },
          SC(b) {
            if (40960 !== (b.mode & 61440)) throw new z(28);
            return b.link;
          },
        },
        AC: {
          read(b, c, g, d, f) {
            var h = b.node.yC;
            if (f >= b.node.CC) return 0;
            b = Math.min(b.node.CC - f, d);
            if (8 < b && h.subarray) c.set(h.subarray(f, f + b), g);
            else for (d = 0; d < b; d++) c[g + d] = h[f + d];
            return b;
          },
          write(b, c, g, d, f, h) {
            c.buffer === n.buffer && (h = !1);
            if (!d) return 0;
            b = b.node;
            b.timestamp = Date.now();
            if (c.subarray && (!b.yC || b.yC.subarray)) {
              if (h) return ((b.yC = c.subarray(g, g + d)), (b.CC = d));
              if (0 === b.CC && 0 === f) return ((b.yC = c.slice(g, g + d)), (b.CC = d));
              if (f + d <= b.CC) return (b.yC.set(c.subarray(g, g + d), f), d);
            }
            qb(b, f + d);
            if (b.yC.subarray && c.subarray) b.yC.set(c.subarray(g, g + d), f);
            else for (h = 0; h < d; h++) b.yC[f + h] = c[g + h];
            b.CC = Math.max(b.CC, f + d);
            return d;
          },
          NC(b, c, g) {
            1 === g
              ? (c += b.position)
              : 2 === g && 32768 === (b.node.mode & 61440) && (c += b.node.CC);
            if (0 > c) throw new z(28);
            return c;
          },
          iD(b, c, g) {
            qb(b.node, c + g);
            b.node.CC = Math.max(b.node.CC, c + g);
          },
          aD(b, c, g, d, f) {
            if (32768 !== (b.node.mode & 61440)) throw new z(43);
            b = b.node.yC;
            if (f & 2 || b.buffer !== n.buffer) {
              if (0 < g || g + c < b.length)
                b.subarray
                  ? (b = b.subarray(g, g + c))
                  : (b = Array.prototype.slice.call(b, g, g + c));
              g = !0;
              x();
              c = void 0;
              if (!c) throw new z(48);
              n.set(b, c);
            } else ((g = !1), (c = b.byteOffset));
            return { DC: c, CD: g };
          },
          oD(b, c, g, d) {
            B.AC.write(b, c, 0, d, g, !1);
            return 0;
          },
        },
      },
      vb = (b, c, g) => {
        var d = `al ${b}`;
        ja(b).then(
          f => {
            c(new Uint8Array(f));
            d && Aa(d);
          },
          () => {
            if (g) g();
            else throw `Loading data file "${b}" failed.`;
          }
        );
        d && za(d);
      },
      wb = a.preloadPlugins || [],
      xb = (b, c, g, d) => {
        'undefined' != typeof Browser && Pa(Browser);
        var f = !1;
        wb.forEach(h => {
          !f && h.canHandle(c) && (h.handle(b, c, g, d), (f = !0));
        });
        return f;
      },
      zb = (b, c, g, d, f, h, k, l, p, q) => {
        function r(D) {
          function G(H) {
            q?.();
            l || yb(b, c, H, d, f, p);
            h?.();
            Aa(A);
          }
          xb(D, t, G, () => {
            k?.();
            Aa(A);
          }) || G(D);
        }
        var t = c ? db(Za(b + '/' + c)) : b,
          A = `cp ${t}`;
        za(A);
        'string' == typeof g ? vb(g, r, k) : r(g);
      },
      Ab = (b, c) => {
        var g = 0;
        b && (g |= 365);
        c && (g |= 146);
        return g;
      },
      Bb = null,
      Cb = {},
      Db = [],
      Eb = 1,
      Fb = null,
      Gb = !0,
      z = class {
        constructor(b) {
          this.name = 'ErrnoError';
          this.KC = b;
        }
      },
      tb = {},
      Hb = class {
        constructor() {
          this.JC = {};
          this.node = null;
        }
        get flags() {
          return this.JC.flags;
        }
        set flags(b) {
          this.JC.flags = b;
        }
        get position() {
          return this.JC.position;
        }
        set position(b) {
          this.JC.position = b;
        }
      },
      Ib = class {
        constructor(b, c, g, d) {
          b ||= this;
          this.parent = b;
          this.HC = b.HC;
          this.RC = null;
          this.id = Eb++;
          this.name = c;
          this.mode = g;
          this.zC = {};
          this.AC = {};
          this.VC = d;
        }
        get read() {
          return 365 === (this.mode & 365);
        }
        set read(b) {
          b ? (this.mode |= 365) : (this.mode &= -366);
        }
        get write() {
          return 146 === (this.mode & 146);
        }
        set write(b) {
          b ? (this.mode |= 146) : (this.mode &= -147);
        }
        get zD() {
          return C(this.mode);
        }
        get yD() {
          return 8192 === (this.mode & 61440);
        }
      };
    function Jb(b, c = {}) {
      b = db(b);
      if (!b) return { path: '', node: null };
      c = Object.assign({ kD: !0, cD: 0 }, c);
      if (8 < c.cD) throw new z(32);
      b = b.split('/').filter(k => !!k);
      for (var g = Bb, d = '/', f = 0; f < b.length; f++) {
        var h = f === b.length - 1;
        if (h && c.parent) break;
        g = ub(g, b[f]);
        d = Za(d + '/' + b[f]);
        g.RC && (!h || (h && c.kD)) && (g = g.RC.root);
        if (!h || c.ZC)
          for (h = 0; 40960 === (g.mode & 61440); )
            if (((g = Kb(d)), (d = db($a(d), g)), (g = Jb(d, { cD: c.cD + 1 }).node), 40 < h++))
              throw new z(32);
      }
      return { path: d, node: g };
    }
    function Lb(b) {
      for (var c; ; ) {
        if (b === b.parent)
          return ((b = b.HC.nD), c ? ('/' !== b[b.length - 1] ? `${b}/${c}` : b + c) : b);
        c = c ? `${b.name}/${c}` : b.name;
        b = b.parent;
      }
    }
    function Mb(b, c) {
      for (var g = 0, d = 0; d < c.length; d++) g = ((g << 5) - g + c.charCodeAt(d)) | 0;
      return ((b + g) >>> 0) % Fb.length;
    }
    function ub(b, c) {
      var g = C(b.mode) ? ((g = Nb(b, 'x')) ? g : b.zC.QC ? 0 : 2) : 54;
      if (g) throw new z(g);
      for (g = Fb[Mb(b.id, c)]; g; g = g.OC) {
        var d = g.name;
        if (g.parent.id === b.id && d === c) return g;
      }
      return b.zC.QC(b, c);
    }
    function sb(b, c, g, d) {
      b = new Ib(b, c, g, d);
      c = Mb(b.parent.id, b.name);
      b.OC = Fb[c];
      return (Fb[c] = b);
    }
    function C(b) {
      return 16384 === (b & 61440);
    }
    function Ob(b) {
      var c = ['r', 'w', 'rw'][b & 3];
      b & 512 && (c += 'w');
      return c;
    }
    function Nb(b, c) {
      if (Gb) return 0;
      if (!c.includes('r') || b.mode & 292) {
        if ((c.includes('w') && !(b.mode & 146)) || (c.includes('x') && !(b.mode & 73))) return 2;
      } else return 2;
      return 0;
    }
    function Pb(b, c) {
      try {
        return (ub(b, c), 20);
      } catch (g) {}
      return Nb(b, 'wx');
    }
    function Qb(b) {
      b = Db[b];
      if (!b) throw new z(8);
      return b;
    }
    function Rb(b, c = -1) {
      b = Object.assign(new Hb(), b);
      if (-1 == c)
        a: {
          for (c = 0; 4096 >= c; c++) if (!Db[c]) break a;
          throw new z(33);
        }
      b.LC = c;
      return (Db[c] = b);
    }
    function Sb(b, c = -1) {
      b = Rb(b, c);
      b.AC?.MD?.(b);
      return b;
    }
    var rb = {
      open(b) {
        b.AC = Cb[b.node.VC].AC;
        b.AC.open?.(b);
      },
      NC() {
        throw new z(70);
      },
    };
    function mb(b, c) {
      Cb[b] = { AC: c };
    }
    function Tb(b, c) {
      var g = '/' === c;
      if (g && Bb) throw new z(10);
      if (!g && c) {
        var d = Jb(c, { kD: !1 });
        c = d.path;
        d = d.node;
        if (d.RC) throw new z(10);
        if (!C(d.mode)) throw new z(54);
      }
      c = { type: b, TD: {}, nD: c, AD: [] };
      b = b.HC(c);
      b.HC = c;
      c.root = b;
      g ? (Bb = b) : d && ((d.RC = c), d.HC && d.HC.AD.push(c));
    }
    function Ub(b, c, g) {
      var d = Jb(b, { parent: !0 }).node;
      b = ab(b);
      if (!b || '.' === b || '..' === b) throw new z(28);
      var f = Pb(d, b);
      if (f) throw new z(f);
      if (!d.zC.UC) throw new z(63);
      return d.zC.UC(d, b, c, g);
    }
    function E(b) {
      return Ub(b, 16895, 0);
    }
    function Vb(b, c, g) {
      'undefined' == typeof g && ((g = c), (c = 438));
      return Ub(b, c | 8192, g);
    }
    function Wb(b, c) {
      if (!db(b)) throw new z(44);
      var g = Jb(c, { parent: !0 }).node;
      if (!g) throw new z(44);
      c = ab(c);
      var d = Pb(g, c);
      if (d) throw new z(d);
      if (!g.zC.WC) throw new z(63);
      g.zC.WC(g, c, b);
    }
    function Xb(b) {
      var c = Jb(b, { parent: !0 }).node;
      if (!c) throw new z(44);
      var g = ab(b);
      b = ub(c, g);
      a: {
        try {
          var d = ub(c, g);
        } catch (h) {
          d = h.KC;
          break a;
        }
        var f = Nb(c, 'wx');
        d = f ? f : C(d.mode) ? 31 : 0;
      }
      if (d) throw new z(d);
      if (!c.zC.XC) throw new z(63);
      if (b.RC) throw new z(10);
      c.zC.XC(c, g);
      c = Mb(b.parent.id, b.name);
      if (Fb[c] === b) Fb[c] = b.OC;
      else
        for (c = Fb[c]; c; ) {
          if (c.OC === b) {
            c.OC = b.OC;
            break;
          }
          c = c.OC;
        }
    }
    function Kb(b) {
      b = Jb(b).node;
      if (!b) throw new z(44);
      if (!b.zC.SC) throw new z(28);
      return db(Lb(b.parent), b.zC.SC(b));
    }
    function Yb(b, c) {
      b = 'string' == typeof b ? Jb(b, { ZC: !0 }).node : b;
      if (!b.zC.FC) throw new z(63);
      b.zC.FC(b, { mode: (c & 4095) | (b.mode & -4096), timestamp: Date.now() });
    }
    function Zb(b, c, g) {
      if ('' === b) throw new z(44);
      if ('string' == typeof c) {
        var d = { r: 0, 'r+': 2, w: 577, 'w+': 578, a: 1089, 'a+': 1090 }[c];
        if ('undefined' == typeof d) throw Error(`Unknown file open mode: ${c}`);
        c = d;
      }
      g = c & 64 ? (('undefined' == typeof g ? 438 : g) & 4095) | 32768 : 0;
      if ('object' == typeof b) var f = b;
      else {
        b = Za(b);
        try {
          f = Jb(b, { ZC: !(c & 131072) }).node;
        } catch (h) {}
      }
      d = !1;
      if (c & 64)
        if (f) {
          if (c & 128) throw new z(20);
        } else ((f = Ub(b, g, 0)), (d = !0));
      if (!f) throw new z(44);
      8192 === (f.mode & 61440) && (c &= -513);
      if (c & 65536 && !C(f.mode)) throw new z(54);
      if (
        !d &&
        (g = f
          ? 40960 === (f.mode & 61440)
            ? 32
            : C(f.mode) && ('r' !== Ob(c) || c & 512)
              ? 31
              : Nb(f, Ob(c))
          : 44)
      )
        throw new z(g);
      if (c & 512 && !d) {
        g = f;
        g = 'string' == typeof g ? Jb(g, { ZC: !0 }).node : g;
        if (!g.zC.FC) throw new z(63);
        if (C(g.mode)) throw new z(31);
        if (32768 !== (g.mode & 61440)) throw new z(28);
        if ((d = Nb(g, 'w'))) throw new z(d);
        g.zC.FC(g, { size: 0, timestamp: Date.now() });
      }
      c &= -131713;
      f = Rb({
        node: f,
        path: Lb(f),
        flags: c,
        seekable: !0,
        position: 0,
        AC: f.AC,
        BD: [],
        error: !1,
      });
      f.AC.open && f.AC.open(f);
      !a.logReadFiles || c & 1 || (($b ||= {}), b in $b || ($b[b] = 1));
      return f;
    }
    function ac(b) {
      if (null === b.LC) throw new z(8);
      b.$C && (b.$C = null);
      try {
        b.AC.close && b.AC.close(b);
      } catch (c) {
        throw c;
      } finally {
        Db[b.LC] = null;
      }
      b.LC = null;
    }
    function bc(b, c, g) {
      if (null === b.LC) throw new z(8);
      if (!b.seekable || !b.AC.NC) throw new z(70);
      if (0 != g && 1 != g && 2 != g) throw new z(28);
      b.position = b.AC.NC(b, c, g);
      b.BD = [];
    }
    function cc(b, c, g, d, f, h) {
      if (0 > d || 0 > f) throw new z(28);
      if (null === b.LC) throw new z(8);
      if (0 === (b.flags & 2097155)) throw new z(8);
      if (C(b.node.mode)) throw new z(31);
      if (!b.AC.write) throw new z(28);
      b.seekable && b.flags & 1024 && bc(b, 0, 2);
      var k = 'undefined' != typeof f;
      if (!k) f = b.position;
      else if (!b.seekable) throw new z(70);
      c = b.AC.write(b, c, g, d, f, h);
      k || (b.position += c);
      return c;
    }
    var dc;
    function ec(b, c) {
      b = 'string' == typeof b ? b : Lb(b);
      for (c = c.split('/').reverse(); c.length; ) {
        var g = c.pop();
        if (g) {
          var d = Za(b + '/' + g);
          try {
            E(d);
          } catch (f) {}
          b = d;
        }
      }
      return d;
    }
    function fc(b, c, g, d) {
      b = Za(('string' == typeof b ? b : Lb(b)) + '/' + c);
      g = Ab(g, d);
      return Ub(b, ((void 0 !== g ? g : 438) & 4095) | 32768, 0);
    }
    function yb(b, c, g, d, f, h) {
      var k = c;
      b && ((b = 'string' == typeof b ? b : Lb(b)), (k = c ? Za(b + '/' + c) : b));
      b = Ab(d, f);
      k = Ub(k, ((void 0 !== b ? b : 438) & 4095) | 32768, 0);
      if (g) {
        if ('string' == typeof g) {
          c = Array(g.length);
          d = 0;
          for (f = g.length; d < f; ++d) c[d] = g.charCodeAt(d);
          g = c;
        }
        Yb(k, b | 146);
        c = Zb(k, 577);
        cc(c, g, 0, g.length, 0, h);
        ac(c);
        Yb(k, b);
      }
    }
    function F(b, c, g, d) {
      b = Za(('string' == typeof b ? b : Lb(b)) + '/' + c);
      c = Ab(!!g, !!d);
      F.mD || (F.mD = 64);
      var f = (F.mD++ << 8) | 0;
      mb(f, {
        open(h) {
          h.seekable = !1;
        },
        close() {
          d?.buffer?.length && d(10);
        },
        read(h, k, l, p) {
          for (var q = 0, r = 0; r < p; r++) {
            try {
              var t = g();
            } catch (A) {
              throw new z(29);
            }
            if (void 0 === t && 0 === q) throw new z(6);
            if (null === t || void 0 === t) break;
            q++;
            k[l + r] = t;
          }
          q && (h.node.timestamp = Date.now());
          return q;
        },
        write(h, k, l, p) {
          for (var q = 0; q < p; q++)
            try {
              d(k[l + q]);
            } catch (r) {
              throw new z(29);
            }
          p && (h.node.timestamp = Date.now());
          return q;
        },
      });
      return Vb(b, c, f);
    }
    function gc(b) {
      if (!(b.yD || b.zD || b.link || b.yC)) {
        if ('undefined' != typeof XMLHttpRequest)
          throw Error(
            'Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.'
          );
        try {
          ((b.yC = ka(b.url)), (b.CC = b.yC.length));
        } catch (c) {
          throw new z(29);
        }
      }
    }
    function hc(b, c, g, d, f) {
      class h {
        constructor() {
          this.YC = !1;
          this.JC = [];
          this.dD = void 0;
          this.eD = this.fD = 0;
        }
        get(r) {
          if (!(r > this.length - 1 || 0 > r)) {
            var t = r % this.hD;
            return this.dD((r / this.hD) | 0)[t];
          }
        }
        sD(r) {
          this.dD = r;
        }
        gD() {
          var r = new XMLHttpRequest();
          r.open('HEAD', g, !1);
          r.send(null);
          if (!((200 <= r.status && 300 > r.status) || 304 === r.status))
            throw Error("Couldn't load " + g + '. Status: ' + r.status);
          var t = Number(r.getResponseHeader('Content-length')),
            A,
            D = (A = r.getResponseHeader('Accept-Ranges')) && 'bytes' === A;
          r = (A = r.getResponseHeader('Content-Encoding')) && 'gzip' === A;
          var G = 1048576;
          D || (G = t);
          var H = this;
          H.sD(J => {
            var Q = J * G,
              X = (J + 1) * G - 1;
            X = Math.min(X, t - 1);
            if ('undefined' == typeof H.JC[J]) {
              var eb = H.JC;
              if (Q > X) throw Error('invalid range (' + Q + ', ' + X + ') or no bytes requested!');
              if (X > t - 1) throw Error('only ' + t + ' bytes available! programmer error!');
              var N = new XMLHttpRequest();
              N.open('GET', g, !1);
              t !== G && N.setRequestHeader('Range', 'bytes=' + Q + '-' + X);
              N.responseType = 'arraybuffer';
              N.overrideMimeType && N.overrideMimeType('text/plain; charset=x-user-defined');
              N.send(null);
              if (!((200 <= N.status && 300 > N.status) || 304 === N.status))
                throw Error("Couldn't load " + g + '. Status: ' + N.status);
              Q =
                void 0 !== N.response ? new Uint8Array(N.response || []) : jb(N.responseText || '');
              eb[J] = Q;
            }
            if ('undefined' == typeof H.JC[J]) throw Error('doXHR failed!');
            return H.JC[J];
          });
          if (r || !t)
            ((G = t = 1),
              (G = t = this.dD(0).length),
              m('LazyFiles on gzip forces download of the whole file when length is accessed'));
          this.fD = t;
          this.eD = G;
          this.YC = !0;
        }
        get length() {
          this.YC || this.gD();
          return this.fD;
        }
        get hD() {
          this.YC || this.gD();
          return this.eD;
        }
      }
      if ('undefined' != typeof XMLHttpRequest) {
        if (!ea)
          throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
        var k = new h();
        var l = void 0;
      } else ((l = g), (k = void 0));
      var p = fc(b, c, d, f);
      k ? (p.yC = k) : l && ((p.yC = null), (p.url = l));
      Object.defineProperties(p, {
        CC: {
          get: function () {
            return this.yC.length;
          },
        },
      });
      var q = {};
      Object.keys(p.AC).forEach(r => {
        var t = p.AC[r];
        q[r] = (...A) => {
          gc(p);
          return t(...A);
        };
      });
      q.read = (r, t, A, D, G) => {
        gc(p);
        r = r.node.yC;
        if (G >= r.length) t = 0;
        else {
          D = Math.min(r.length - G, D);
          if (r.slice) for (var H = 0; H < D; H++) t[A + H] = r[G + H];
          else for (H = 0; H < D; H++) t[A + H] = r.get(G + H);
          t = D;
        }
        return t;
      };
      q.aD = () => {
        gc(p);
        x();
        throw new z(48);
      };
      p.AC = q;
      return p;
    }
    var ic = {},
      $b,
      I = b => (b ? y(u, b) : ''),
      Xa = void 0,
      jc = {},
      lc = () => {
        if (!kc) {
          var b = {
              USER: 'web_user',
              LOGNAME: 'web_user',
              PATH: '/',
              PWD: '/',
              HOME: '/home/web_user',
              LANG:
                (
                  ('object' == typeof navigator && navigator.languages && navigator.languages[0]) ||
                  'C'
                ).replace('-', '_') + '.UTF-8',
              _: ha || './this.program',
            },
            c;
          for (c in jc) void 0 === jc[c] ? delete b[c] : (b[c] = jc[c]);
          var g = [];
          for (c in b) g.push(`${c}=${b[c]}`);
          kc = g;
        }
        return kc;
      },
      kc,
      mc = (b, c) => {
        for (var g = 0; g < b.length; ++g) n[c++] = b.charCodeAt(g);
        n[c] = 0;
      },
      K,
      nc = b => {
        var c = hb(b) + 1,
          g = L(c);
        ib(b, u, g, c);
        return g;
      };
    [44].forEach(b => {
      tb[b] = new z(b);
      tb[b].stack = '<generic error, no stack>';
    });
    Fb = Array(4096);
    Tb(B, '/');
    E('/tmp');
    E('/home');
    E('/home/web_user');
    (function () {
      E('/dev');
      mb(259, { read: () => 0, write: (d, f, h, k) => k });
      Vb('/dev/null', 259);
      lb(1280, ob);
      lb(1536, pb);
      Vb('/dev/tty', 1280);
      Vb('/dev/tty1', 1536);
      var b = new Uint8Array(1024),
        c = 0,
        g = () => {
          0 === c && (c = cb(b).byteLength);
          return b[--c];
        };
      F('/dev', 'random', g);
      F('/dev', 'urandom', g);
      E('/dev/shm');
      E('/dev/shm/tmp');
    })();
    (function () {
      E('/proc');
      var b = E('/proc/self');
      E('/proc/self/fd');
      Tb(
        {
          HC() {
            var c = sb(b, 'fd', 16895, 73);
            c.zC = {
              QC(g, d) {
                var f = Qb(+d);
                g = { parent: null, HC: { nD: 'fake' }, zC: { SC: () => f.path } };
                return (g.parent = g);
              },
            };
            return c;
          },
        },
        '/proc/self/fd'
      );
    })();
    a.FS_createPath = ec;
    a.FS_createDataFile = yb;
    a.FS_createPreloadedFile = zb;
    a.FS_unlink = Xb;
    a.FS_createLazyFile = hc;
    a.FS_createDevice = F;
    var Sd = {
        o: b => {
          b = new Sa(b);
          0 == n[b.DC + 12] && ((n[b.DC + 12] = 1), Na--);
          n[b.DC + 13] = 0;
          Ma.push(b);
          oc(b.PC);
          return Qa(b);
        },
        s: () => {
          M(0, 0);
          var b = Ma.pop();
          pc(b.PC);
          Oa = 0;
        },
        a: () => Va([]),
        l: b => Va([b]),
        La: b => Qa(new Sa(b)),
        E: () => {
          var b = Ma.pop();
          b || x('no exception to throw');
          var c = b.PC;
          0 == n[b.DC + 13] && (Ma.push(b), (n[b.DC + 13] = 1), (n[b.DC + 12] = 0), Na++);
          Oa = c;
          throw Oa;
        },
        t: (b, c, g) => {
          Pa(new Sa(b), c, g);
          Oa = b;
          Na++;
          throw Oa;
        },
        Qa: () => Na,
        f: b => {
          Oa ||= b;
          throw Oa;
        },
        F: function (b, c, g) {
          Xa = g;
          try {
            var d = Qb(b);
            switch (c) {
              case 0:
                var f = Wa();
                if (0 > f) break;
                for (; Db[f]; ) f++;
                return Sb(d, f).LC;
              case 1:
              case 2:
                return 0;
              case 3:
                return d.flags;
              case 4:
                return ((f = Wa()), (d.flags |= f), 0);
              case 12:
                return ((f = Wa()), (pa[(f + 0) >> 1] = 2), 0);
              case 13:
              case 14:
                return 0;
            }
            return -28;
          } catch (h) {
            if ('undefined' == typeof ic || 'ErrnoError' !== h.name) throw h;
            return -h.KC;
          }
        },
        Oa: function (b, c, g) {
          Xa = g;
          try {
            var d = Qb(b);
            switch (c) {
              case 21509:
                return d.BC ? 0 : -59;
              case 21505:
                if (!d.BC) return -59;
                if (d.BC.IC.vD) {
                  b = [
                    3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0,
                  ];
                  var f = Wa();
                  v[f >> 2] = 25856;
                  v[(f + 4) >> 2] = 5;
                  v[(f + 8) >> 2] = 191;
                  v[(f + 12) >> 2] = 35387;
                  for (var h = 0; 32 > h; h++) n[f + h + 17] = b[h] || 0;
                }
                return 0;
              case 21510:
              case 21511:
              case 21512:
                return d.BC ? 0 : -59;
              case 21506:
              case 21507:
              case 21508:
                if (!d.BC) return -59;
                if (d.BC.IC.wD) for (f = Wa(), b = [], h = 0; 32 > h; h++) b.push(n[f + h + 17]);
                return 0;
              case 21519:
                if (!d.BC) return -59;
                f = Wa();
                return (v[f >> 2] = 0);
              case 21520:
                return d.BC ? -28 : -59;
              case 21531:
                f = Wa();
                if (!d.AC.uD) throw new z(59);
                return d.AC.uD(d, c, f);
              case 21523:
                if (!d.BC) return -59;
                d.BC.IC.xD &&
                  ((h = [24, 80]), (f = Wa()), (pa[f >> 1] = h[0]), (pa[(f + 2) >> 1] = h[1]));
                return 0;
              case 21524:
                return d.BC ? 0 : -59;
              case 21515:
                return d.BC ? 0 : -59;
              default:
                return -28;
            }
          } catch (k) {
            if ('undefined' == typeof ic || 'ErrnoError' !== k.name) throw k;
            return -k.KC;
          }
        },
        Pa: function (b, c, g, d) {
          Xa = d;
          try {
            c = c ? y(u, c) : '';
            var f = c;
            if ('/' === f.charAt(0)) c = f;
            else {
              var h = -100 === b ? '/' : Qb(b).path;
              if (0 == f.length) throw new z(44);
              c = Za(h + '/' + f);
            }
            var k = d ? Wa() : 0;
            return Zb(c, g, k).LC;
          } catch (l) {
            if ('undefined' == typeof ic || 'ErrnoError' !== l.name) throw l;
            return -l.KC;
          }
        },
        wa: () => {
          x('');
        },
        Ra: () => 1,
        Ma: (b, c, g, d) => {
          var f = new Date().getFullYear(),
            h = new Date(f, 0, 1),
            k = new Date(f, 6, 1);
          f = h.getTimezoneOffset();
          var l = k.getTimezoneOffset();
          w[b >> 2] = 60 * Math.max(f, l);
          v[c >> 2] = Number(f != l);
          b = p =>
            p.toLocaleTimeString(void 0, { hour12: !1, timeZoneName: 'short' }).split(' ')[1];
          h = b(h);
          k = b(k);
          l < f ? (ib(h, u, g, 17), ib(k, u, d, 17)) : (ib(h, u, d, 17), ib(k, u, g, 17));
        },
        R: () => performance.now(),
        Sa: b => {
          var c = u.length;
          b >>>= 0;
          if (2147483648 < b) return !1;
          for (var g = 1; 4 >= g; g *= 2) {
            var d = c * (1 + 0.2 / g);
            d = Math.min(d, b + 100663296);
            var f = Math;
            d = Math.max(b, d);
            a: {
              f =
                (f.min.call(f, 2147483648, d + ((65536 - (d % 65536)) % 65536)) -
                  na.buffer.byteLength +
                  65535) /
                65536;
              try {
                na.grow(f);
                qa();
                var h = 1;
                break a;
              } catch (k) {}
              h = void 0;
            }
            if (h) return !0;
          }
          return !1;
        },
        aa: (b, c) => {
          var g = 0;
          lc().forEach((d, f) => {
            var h = c + g;
            w[(b + 4 * f) >> 2] = h;
            mc(d, h);
            g += d.length + 1;
          });
          return 0;
        },
        la: (b, c) => {
          var g = lc();
          w[b >> 2] = g.length;
          var d = 0;
          g.forEach(f => (d += f.length + 1));
          w[c >> 2] = d;
          return 0;
        },
        G: function (b) {
          try {
            var c = Qb(b);
            ac(c);
            return 0;
          } catch (g) {
            if ('undefined' == typeof ic || 'ErrnoError' !== g.name) throw g;
            return g.KC;
          }
        },
        Na: function (b, c, g, d) {
          try {
            a: {
              var f = Qb(b);
              b = c;
              for (var h, k = (c = 0); k < g; k++) {
                var l = w[b >> 2],
                  p = w[(b + 4) >> 2];
                b += 8;
                var q = f,
                  r = h,
                  t = n;
                if (0 > p || 0 > r) throw new z(28);
                if (null === q.LC) throw new z(8);
                if (1 === (q.flags & 2097155)) throw new z(8);
                if (C(q.node.mode)) throw new z(31);
                if (!q.AC.read) throw new z(28);
                var A = 'undefined' != typeof r;
                if (!A) r = q.position;
                else if (!q.seekable) throw new z(70);
                var D = q.AC.read(q, t, l, p, r);
                A || (q.position += D);
                var G = D;
                if (0 > G) {
                  var H = -1;
                  break a;
                }
                c += G;
                if (G < p) break;
                'undefined' != typeof h && (h += G);
              }
              H = c;
            }
            w[d >> 2] = H;
            return 0;
          } catch (J) {
            if ('undefined' == typeof ic || 'ErrnoError' !== J.name) throw J;
            return J.KC;
          }
        },
        Ia: function (b, c, g, d, f) {
          c = (g + 2097152) >>> 0 < 4194305 - !!c ? (c >>> 0) + 4294967296 * g : NaN;
          try {
            if (isNaN(c)) return 61;
            var h = Qb(b);
            bc(h, c, d);
            Ia = [
              h.position >>> 0,
              ((Ha = h.position),
              1 <= +Math.abs(Ha)
                ? 0 < Ha
                  ? +Math.floor(Ha / 4294967296) >>> 0
                  : ~~+Math.ceil((Ha - +(~~Ha >>> 0)) / 4294967296) >>> 0
                : 0),
            ];
            v[f >> 2] = Ia[0];
            v[(f + 4) >> 2] = Ia[1];
            h.$C && 0 === c && 0 === d && (h.$C = null);
            return 0;
          } catch (k) {
            if ('undefined' == typeof ic || 'ErrnoError' !== k.name) throw k;
            return k.KC;
          }
        },
        Ta: function (b, c, g, d) {
          try {
            a: {
              var f = Qb(b);
              b = c;
              for (var h, k = (c = 0); k < g; k++) {
                var l = w[b >> 2],
                  p = w[(b + 4) >> 2];
                b += 8;
                var q = cc(f, n, l, p, h);
                if (0 > q) {
                  var r = -1;
                  break a;
                }
                c += q;
                'undefined' != typeof h && (h += q);
              }
              r = c;
            }
            w[d >> 2] = r;
            return 0;
          } catch (t) {
            if ('undefined' == typeof ic || 'ErrnoError' !== t.name) throw t;
            return t.KC;
          }
        },
        u: qc,
        g: rc,
        D: sc,
        b: tc,
        e: uc,
        j: vc,
        Ja: wc,
        m: xc,
        q: yc,
        B: zc,
        y: Ac,
        W: Bc,
        U: Cc,
        $: Dc,
        ha: Ec,
        Ca: Fc,
        ba: Gc,
        ia: Hc,
        Xa: Ic,
        ka: Jc,
        Ga: Kc,
        ya: Lc,
        ca: Mc,
        ga: Nc,
        ea: Oc,
        V: Pc,
        da: Qc,
        va: Rc,
        xa: Sc,
        fa: Tc,
        Aa: Uc,
        Va: Vc,
        Z: Wc,
        Ua: Xc,
        oa: Yc,
        na: Zc,
        h: $c,
        k: ad,
        Ka: bd,
        z: cd,
        d: dd,
        A: ed,
        c: fd,
        i: gd,
        n: hd,
        p: jd,
        r: kd,
        C: ld,
        w: md,
        x: nd,
        Ya: od,
        I: pd,
        X: qd,
        H: rd,
        N: sd,
        L: td,
        Da: ud,
        sa: vd,
        J: wd,
        Y: xd,
        M: yd,
        O: zd,
        K: Ad,
        Q: Bd,
        Ea: Cd,
        Fa: Dd,
        ra: Ed,
        S: Fd,
        T: Gd,
        P: Hd,
        qa: Id,
        _: Jd,
        Wa: Kd,
        Ba: Ld,
        za: Md,
        ma: Nd,
        ja: Od,
        pa: Pd,
        ta: Qd,
        ua: Rd,
        v: b => b,
        Ha: b => {
          La || (a.onExit?.(b), (oa = !0));
          ia(b, new Ja(b));
        },
      },
      O = await (async function () {
        function b(g) {
          O = g.exports;
          na = O.Za;
          qa();
          K = O.nB;
          sa.unshift(O._a);
          Aa('wasm-instantiate');
          return O;
        }
        var c = { a: Sd };
        za('wasm-instantiate');
        if (a.instantiateWasm)
          try {
            return await a.instantiateWasm(c, b);
          } catch (g) {
            (la(`Module.instantiateWasm callback failed with error: ${g}`), ba(g));
          }
        Ca ||= a.locateFile
          ? Ba('binaryen_wasm.wasm')
            ? 'binaryen_wasm.wasm'
            : a.locateFile
              ? a.locateFile('binaryen_wasm.wasm', e)
              : e + 'binaryen_wasm.wasm'
          : new URL('binaryen_wasm.wasm', import.meta.url).href;
        Ga(c, function (g) {
          b(g.instance);
        }).catch(ba);
        return {};
      })();
    a._BinaryenTypeNone = () => (a._BinaryenTypeNone = O.$a)();
    a._BinaryenTypeInt32 = () => (a._BinaryenTypeInt32 = O.ab)();
    a._BinaryenTypeInt64 = () => (a._BinaryenTypeInt64 = O.bb)();
    a._BinaryenTypeFloat32 = () => (a._BinaryenTypeFloat32 = O.cb)();
    a._BinaryenTypeFloat64 = () => (a._BinaryenTypeFloat64 = O.db)();
    a._BinaryenTypeVec128 = () => (a._BinaryenTypeVec128 = O.eb)();
    a._BinaryenTypeFuncref = () => (a._BinaryenTypeFuncref = O.fb)();
    a._BinaryenTypeExternref = () => (a._BinaryenTypeExternref = O.gb)();
    a._BinaryenTypeAnyref = () => (a._BinaryenTypeAnyref = O.hb)();
    a._BinaryenTypeEqref = () => (a._BinaryenTypeEqref = O.ib)();
    a._BinaryenTypeI31ref = () => (a._BinaryenTypeI31ref = O.jb)();
    a._BinaryenTypeStructref = () => (a._BinaryenTypeStructref = O.kb)();
    a._BinaryenTypeArrayref = () => (a._BinaryenTypeArrayref = O.lb)();
    a._BinaryenTypeStringref = () => (a._BinaryenTypeStringref = O.mb)();
    a._BinaryenTypeNullref = () => (a._BinaryenTypeNullref = O.nb)();
    a._BinaryenTypeNullExternref = () => (a._BinaryenTypeNullExternref = O.ob)();
    a._BinaryenTypeNullFuncref = () => (a._BinaryenTypeNullFuncref = O.pb)();
    a._BinaryenTypeUnreachable = () => (a._BinaryenTypeUnreachable = O.qb)();
    a._BinaryenTypeAuto = () => (a._BinaryenTypeAuto = O.rb)();
    a._BinaryenTypeCreate = (b, c) => (a._BinaryenTypeCreate = O.sb)(b, c);
    a._BinaryenTypeArity = b => (a._BinaryenTypeArity = O.tb)(b);
    a._BinaryenTypeExpand = (b, c) => (a._BinaryenTypeExpand = O.ub)(b, c);
    a._BinaryenPackedTypeNotPacked = () => (a._BinaryenPackedTypeNotPacked = O.vb)();
    a._BinaryenPackedTypeInt8 = () => (a._BinaryenPackedTypeInt8 = O.wb)();
    a._BinaryenPackedTypeInt16 = () => (a._BinaryenPackedTypeInt16 = O.xb)();
    a._BinaryenHeapTypeExt = () => (a._BinaryenHeapTypeExt = O.yb)();
    a._BinaryenHeapTypeFunc = () => (a._BinaryenHeapTypeFunc = O.zb)();
    a._BinaryenHeapTypeAny = () => (a._BinaryenHeapTypeAny = O.Ab)();
    a._BinaryenHeapTypeEq = () => (a._BinaryenHeapTypeEq = O.Bb)();
    a._BinaryenHeapTypeI31 = () => (a._BinaryenHeapTypeI31 = O.Cb)();
    a._BinaryenHeapTypeStruct = () => (a._BinaryenHeapTypeStruct = O.Db)();
    a._BinaryenHeapTypeArray = () => (a._BinaryenHeapTypeArray = O.Eb)();
    a._BinaryenHeapTypeString = () => (a._BinaryenHeapTypeString = O.Fb)();
    a._BinaryenHeapTypeNone = () => (a._BinaryenHeapTypeNone = O.Gb)();
    a._BinaryenHeapTypeNoext = () => (a._BinaryenHeapTypeNoext = O.Hb)();
    a._BinaryenHeapTypeNofunc = () => (a._BinaryenHeapTypeNofunc = O.Ib)();
    a._BinaryenHeapTypeIsBasic = b => (a._BinaryenHeapTypeIsBasic = O.Jb)(b);
    a._BinaryenHeapTypeIsSignature = b => (a._BinaryenHeapTypeIsSignature = O.Kb)(b);
    a._BinaryenHeapTypeIsStruct = b => (a._BinaryenHeapTypeIsStruct = O.Lb)(b);
    a._BinaryenHeapTypeIsArray = b => (a._BinaryenHeapTypeIsArray = O.Mb)(b);
    a._BinaryenHeapTypeIsBottom = b => (a._BinaryenHeapTypeIsBottom = O.Nb)(b);
    a._BinaryenHeapTypeGetBottom = b => (a._BinaryenHeapTypeGetBottom = O.Ob)(b);
    a._BinaryenHeapTypeIsSubType = (b, c) => (a._BinaryenHeapTypeIsSubType = O.Pb)(b, c);
    a._BinaryenStructTypeGetNumFields = b => (a._BinaryenStructTypeGetNumFields = O.Qb)(b);
    a._BinaryenStructTypeGetFieldType = (b, c) => (a._BinaryenStructTypeGetFieldType = O.Rb)(b, c);
    a._BinaryenStructTypeGetFieldPackedType = (b, c) =>
      (a._BinaryenStructTypeGetFieldPackedType = O.Sb)(b, c);
    a._BinaryenStructTypeIsFieldMutable = (b, c) =>
      (a._BinaryenStructTypeIsFieldMutable = O.Tb)(b, c);
    a._BinaryenArrayTypeGetElementType = b => (a._BinaryenArrayTypeGetElementType = O.Ub)(b);
    a._BinaryenArrayTypeGetElementPackedType = b =>
      (a._BinaryenArrayTypeGetElementPackedType = O.Vb)(b);
    a._BinaryenArrayTypeIsElementMutable = b => (a._BinaryenArrayTypeIsElementMutable = O.Wb)(b);
    a._BinaryenSignatureTypeGetParams = b => (a._BinaryenSignatureTypeGetParams = O.Xb)(b);
    a._BinaryenSignatureTypeGetResults = b => (a._BinaryenSignatureTypeGetResults = O.Yb)(b);
    a._BinaryenTypeGetHeapType = b => (a._BinaryenTypeGetHeapType = O.Zb)(b);
    a._BinaryenTypeIsNullable = b => (a._BinaryenTypeIsNullable = O._b)(b);
    a._BinaryenTypeFromHeapType = (b, c) => (a._BinaryenTypeFromHeapType = O.$b)(b, c);
    a._BinaryenInvalidId = () => (a._BinaryenInvalidId = O.ac)();
    a._BinaryenNopId = () => (a._BinaryenNopId = O.bc)();
    a._BinaryenBlockId = () => (a._BinaryenBlockId = O.cc)();
    a._BinaryenIfId = () => (a._BinaryenIfId = O.dc)();
    a._BinaryenLoopId = () => (a._BinaryenLoopId = O.ec)();
    a._BinaryenBreakId = () => (a._BinaryenBreakId = O.fc)();
    a._BinaryenSwitchId = () => (a._BinaryenSwitchId = O.gc)();
    a._BinaryenCallId = () => (a._BinaryenCallId = O.hc)();
    a._BinaryenCallIndirectId = () => (a._BinaryenCallIndirectId = O.ic)();
    a._BinaryenLocalGetId = () => (a._BinaryenLocalGetId = O.jc)();
    a._BinaryenLocalSetId = () => (a._BinaryenLocalSetId = O.kc)();
    a._BinaryenGlobalGetId = () => (a._BinaryenGlobalGetId = O.lc)();
    a._BinaryenGlobalSetId = () => (a._BinaryenGlobalSetId = O.mc)();
    a._BinaryenLoadId = () => (a._BinaryenLoadId = O.nc)();
    a._BinaryenStoreId = () => (a._BinaryenStoreId = O.oc)();
    a._BinaryenAtomicRMWId = () => (a._BinaryenAtomicRMWId = O.pc)();
    a._BinaryenAtomicCmpxchgId = () => (a._BinaryenAtomicCmpxchgId = O.qc)();
    a._BinaryenAtomicWaitId = () => (a._BinaryenAtomicWaitId = O.rc)();
    a._BinaryenAtomicNotifyId = () => (a._BinaryenAtomicNotifyId = O.sc)();
    a._BinaryenAtomicFenceId = () => (a._BinaryenAtomicFenceId = O.tc)();
    a._BinaryenPauseId = () => (a._BinaryenPauseId = O.uc)();
    a._BinaryenSIMDExtractId = () => (a._BinaryenSIMDExtractId = O.vc)();
    a._BinaryenSIMDReplaceId = () => (a._BinaryenSIMDReplaceId = O.wc)();
    a._BinaryenSIMDShuffleId = () => (a._BinaryenSIMDShuffleId = O.xc)();
    a._BinaryenSIMDTernaryId = () => (a._BinaryenSIMDTernaryId = O.yc)();
    a._BinaryenSIMDShiftId = () => (a._BinaryenSIMDShiftId = O.zc)();
    a._BinaryenSIMDLoadId = () => (a._BinaryenSIMDLoadId = O.Ac)();
    a._BinaryenSIMDLoadStoreLaneId = () => (a._BinaryenSIMDLoadStoreLaneId = O.Bc)();
    a._BinaryenMemoryInitId = () => (a._BinaryenMemoryInitId = O.Cc)();
    a._BinaryenDataDropId = () => (a._BinaryenDataDropId = O.Dc)();
    a._BinaryenMemoryCopyId = () => (a._BinaryenMemoryCopyId = O.Ec)();
    a._BinaryenMemoryFillId = () => (a._BinaryenMemoryFillId = O.Fc)();
    a._BinaryenConstId = () => (a._BinaryenConstId = O.Gc)();
    a._BinaryenUnaryId = () => (a._BinaryenUnaryId = O.Hc)();
    a._BinaryenBinaryId = () => (a._BinaryenBinaryId = O.Ic)();
    a._BinaryenSelectId = () => (a._BinaryenSelectId = O.Jc)();
    a._BinaryenDropId = () => (a._BinaryenDropId = O.Kc)();
    a._BinaryenReturnId = () => (a._BinaryenReturnId = O.Lc)();
    a._BinaryenMemorySizeId = () => (a._BinaryenMemorySizeId = O.Mc)();
    a._BinaryenMemoryGrowId = () => (a._BinaryenMemoryGrowId = O.Nc)();
    a._BinaryenUnreachableId = () => (a._BinaryenUnreachableId = O.Oc)();
    a._BinaryenPopId = () => (a._BinaryenPopId = O.Pc)();
    a._BinaryenRefNullId = () => (a._BinaryenRefNullId = O.Qc)();
    a._BinaryenRefIsNullId = () => (a._BinaryenRefIsNullId = O.Rc)();
    a._BinaryenRefFuncId = () => (a._BinaryenRefFuncId = O.Sc)();
    a._BinaryenRefEqId = () => (a._BinaryenRefEqId = O.Tc)();
    a._BinaryenTableGetId = () => (a._BinaryenTableGetId = O.Uc)();
    a._BinaryenTableSetId = () => (a._BinaryenTableSetId = O.Vc)();
    a._BinaryenTableSizeId = () => (a._BinaryenTableSizeId = O.Wc)();
    a._BinaryenTableGrowId = () => (a._BinaryenTableGrowId = O.Xc)();
    a._BinaryenTableFillId = () => (a._BinaryenTableFillId = O.Yc)();
    a._BinaryenTableCopyId = () => (a._BinaryenTableCopyId = O.Zc)();
    a._BinaryenTableInitId = () => (a._BinaryenTableInitId = O._c)();
    a._BinaryenElemDropId = () => (a._BinaryenElemDropId = O.$c)();
    a._BinaryenTryId = () => (a._BinaryenTryId = O.ad)();
    a._BinaryenTryTableId = () => (a._BinaryenTryTableId = O.bd)();
    a._BinaryenThrowId = () => (a._BinaryenThrowId = O.cd)();
    a._BinaryenRethrowId = () => (a._BinaryenRethrowId = O.dd)();
    a._BinaryenThrowRefId = () => (a._BinaryenThrowRefId = O.ed)();
    a._BinaryenTupleMakeId = () => (a._BinaryenTupleMakeId = O.fd)();
    a._BinaryenTupleExtractId = () => (a._BinaryenTupleExtractId = O.gd)();
    a._BinaryenRefI31Id = () => (a._BinaryenRefI31Id = O.hd)();
    a._BinaryenI31GetId = () => (a._BinaryenI31GetId = O.id)();
    a._BinaryenCallRefId = () => (a._BinaryenCallRefId = O.jd)();
    a._BinaryenRefTestId = () => (a._BinaryenRefTestId = O.kd)();
    a._BinaryenRefCastId = () => (a._BinaryenRefCastId = O.ld)();
    a._BinaryenRefGetDescId = () => (a._BinaryenRefGetDescId = O.md)();
    a._BinaryenBrOnId = () => (a._BinaryenBrOnId = O.nd)();
    a._BinaryenStructNewId = () => (a._BinaryenStructNewId = O.od)();
    a._BinaryenStructGetId = () => (a._BinaryenStructGetId = O.pd)();
    a._BinaryenStructSetId = () => (a._BinaryenStructSetId = O.qd)();
    a._BinaryenStructRMWId = () => (a._BinaryenStructRMWId = O.rd)();
    a._BinaryenStructCmpxchgId = () => (a._BinaryenStructCmpxchgId = O.sd)();
    a._BinaryenArrayNewId = () => (a._BinaryenArrayNewId = O.td)();
    a._BinaryenArrayNewDataId = () => (a._BinaryenArrayNewDataId = O.ud)();
    a._BinaryenArrayNewElemId = () => (a._BinaryenArrayNewElemId = O.vd)();
    a._BinaryenArrayNewFixedId = () => (a._BinaryenArrayNewFixedId = O.wd)();
    a._BinaryenArrayGetId = () => (a._BinaryenArrayGetId = O.xd)();
    a._BinaryenArraySetId = () => (a._BinaryenArraySetId = O.yd)();
    a._BinaryenArrayLenId = () => (a._BinaryenArrayLenId = O.zd)();
    a._BinaryenArrayCopyId = () => (a._BinaryenArrayCopyId = O.Ad)();
    a._BinaryenArrayFillId = () => (a._BinaryenArrayFillId = O.Bd)();
    a._BinaryenArrayInitDataId = () => (a._BinaryenArrayInitDataId = O.Cd)();
    a._BinaryenArrayInitElemId = () => (a._BinaryenArrayInitElemId = O.Dd)();
    a._BinaryenArrayRMWId = () => (a._BinaryenArrayRMWId = O.Ed)();
    a._BinaryenArrayCmpxchgId = () => (a._BinaryenArrayCmpxchgId = O.Fd)();
    a._BinaryenRefAsId = () => (a._BinaryenRefAsId = O.Gd)();
    a._BinaryenStringNewId = () => (a._BinaryenStringNewId = O.Hd)();
    a._BinaryenStringConstId = () => (a._BinaryenStringConstId = O.Id)();
    a._BinaryenStringMeasureId = () => (a._BinaryenStringMeasureId = O.Jd)();
    a._BinaryenStringEncodeId = () => (a._BinaryenStringEncodeId = O.Kd)();
    a._BinaryenStringConcatId = () => (a._BinaryenStringConcatId = O.Ld)();
    a._BinaryenStringEqId = () => (a._BinaryenStringEqId = O.Md)();
    a._BinaryenStringTestId = () => (a._BinaryenStringTestId = O.Nd)();
    a._BinaryenStringWTF16GetId = () => (a._BinaryenStringWTF16GetId = O.Od)();
    a._BinaryenStringSliceWTFId = () => (a._BinaryenStringSliceWTFId = O.Pd)();
    a._BinaryenContNewId = () => (a._BinaryenContNewId = O.Qd)();
    a._BinaryenContBindId = () => (a._BinaryenContBindId = O.Rd)();
    a._BinaryenSuspendId = () => (a._BinaryenSuspendId = O.Sd)();
    a._BinaryenResumeId = () => (a._BinaryenResumeId = O.Td)();
    a._BinaryenResumeThrowId = () => (a._BinaryenResumeThrowId = O.Ud)();
    a._BinaryenStackSwitchId = () => (a._BinaryenStackSwitchId = O.Vd)();
    a._BinaryenExternalFunction = () => (a._BinaryenExternalFunction = O.Wd)();
    a._BinaryenExternalTable = () => (a._BinaryenExternalTable = O.Xd)();
    a._BinaryenExternalMemory = () => (a._BinaryenExternalMemory = O.Yd)();
    a._BinaryenExternalGlobal = () => (a._BinaryenExternalGlobal = O.Zd)();
    a._BinaryenExternalTag = () => (a._BinaryenExternalTag = O._d)();
    a._BinaryenFeatureMVP = () => (a._BinaryenFeatureMVP = O.$d)();
    a._BinaryenFeatureAtomics = () => (a._BinaryenFeatureAtomics = O.ae)();
    a._BinaryenFeatureMutableGlobals = () => (a._BinaryenFeatureMutableGlobals = O.be)();
    a._BinaryenFeatureNontrappingFPToInt = () => (a._BinaryenFeatureNontrappingFPToInt = O.ce)();
    a._BinaryenFeatureSIMD128 = () => (a._BinaryenFeatureSIMD128 = O.de)();
    a._BinaryenFeatureBulkMemory = () => (a._BinaryenFeatureBulkMemory = O.ee)();
    a._BinaryenFeatureSignExt = () => (a._BinaryenFeatureSignExt = O.fe)();
    a._BinaryenFeatureExceptionHandling = () => (a._BinaryenFeatureExceptionHandling = O.ge)();
    a._BinaryenFeatureTailCall = () => (a._BinaryenFeatureTailCall = O.he)();
    a._BinaryenFeatureReferenceTypes = () => (a._BinaryenFeatureReferenceTypes = O.ie)();
    a._BinaryenFeatureMultivalue = () => (a._BinaryenFeatureMultivalue = O.je)();
    a._BinaryenFeatureGC = () => (a._BinaryenFeatureGC = O.ke)();
    a._BinaryenFeatureMemory64 = () => (a._BinaryenFeatureMemory64 = O.le)();
    a._BinaryenFeatureRelaxedSIMD = () => (a._BinaryenFeatureRelaxedSIMD = O.me)();
    a._BinaryenFeatureExtendedConst = () => (a._BinaryenFeatureExtendedConst = O.ne)();
    a._BinaryenFeatureStrings = () => (a._BinaryenFeatureStrings = O.oe)();
    a._BinaryenFeatureMultiMemory = () => (a._BinaryenFeatureMultiMemory = O.pe)();
    a._BinaryenFeatureStackSwitching = () => (a._BinaryenFeatureStackSwitching = O.qe)();
    a._BinaryenFeatureSharedEverything = () => (a._BinaryenFeatureSharedEverything = O.re)();
    a._BinaryenFeatureFP16 = () => (a._BinaryenFeatureFP16 = O.se)();
    a._BinaryenFeatureBulkMemoryOpt = () => (a._BinaryenFeatureBulkMemoryOpt = O.te)();
    a._BinaryenFeatureCallIndirectOverlong = () =>
      (a._BinaryenFeatureCallIndirectOverlong = O.ue)();
    a._BinaryenFeatureAll = () => (a._BinaryenFeatureAll = O.ve)();
    a._BinaryenModuleCreate = () => (a._BinaryenModuleCreate = O.we)();
    a._BinaryenModuleDispose = b => (a._BinaryenModuleDispose = O.xe)(b);
    a._BinaryenLiteralInt32 = (b, c) => (a._BinaryenLiteralInt32 = O.ye)(b, c);
    a._BinaryenLiteralInt64 = (b, c, g) => (a._BinaryenLiteralInt64 = O.ze)(b, c, g);
    a._BinaryenLiteralFloat32 = (b, c) => (a._BinaryenLiteralFloat32 = O.Ae)(b, c);
    a._BinaryenLiteralFloat64 = (b, c) => (a._BinaryenLiteralFloat64 = O.Be)(b, c);
    a._BinaryenLiteralVec128 = (b, c) => (a._BinaryenLiteralVec128 = O.Ce)(b, c);
    a._BinaryenLiteralFloat32Bits = (b, c) => (a._BinaryenLiteralFloat32Bits = O.De)(b, c);
    a._BinaryenLiteralFloat64Bits = (b, c, g) => (a._BinaryenLiteralFloat64Bits = O.Ee)(b, c, g);
    a._BinaryenClzInt32 = () => (a._BinaryenClzInt32 = O.Fe)();
    a._BinaryenCtzInt32 = () => (a._BinaryenCtzInt32 = O.Ge)();
    a._BinaryenPopcntInt32 = () => (a._BinaryenPopcntInt32 = O.He)();
    a._BinaryenNegFloat32 = () => (a._BinaryenNegFloat32 = O.Ie)();
    a._BinaryenAbsFloat32 = () => (a._BinaryenAbsFloat32 = O.Je)();
    a._BinaryenCeilFloat32 = () => (a._BinaryenCeilFloat32 = O.Ke)();
    a._BinaryenFloorFloat32 = () => (a._BinaryenFloorFloat32 = O.Le)();
    a._BinaryenTruncFloat32 = () => (a._BinaryenTruncFloat32 = O.Me)();
    a._BinaryenNearestFloat32 = () => (a._BinaryenNearestFloat32 = O.Ne)();
    a._BinaryenSqrtFloat32 = () => (a._BinaryenSqrtFloat32 = O.Oe)();
    a._BinaryenEqZInt32 = () => (a._BinaryenEqZInt32 = O.Pe)();
    a._BinaryenClzInt64 = () => (a._BinaryenClzInt64 = O.Qe)();
    a._BinaryenCtzInt64 = () => (a._BinaryenCtzInt64 = O.Re)();
    a._BinaryenPopcntInt64 = () => (a._BinaryenPopcntInt64 = O.Se)();
    a._BinaryenNegFloat64 = () => (a._BinaryenNegFloat64 = O.Te)();
    a._BinaryenAbsFloat64 = () => (a._BinaryenAbsFloat64 = O.Ue)();
    a._BinaryenCeilFloat64 = () => (a._BinaryenCeilFloat64 = O.Ve)();
    a._BinaryenFloorFloat64 = () => (a._BinaryenFloorFloat64 = O.We)();
    a._BinaryenTruncFloat64 = () => (a._BinaryenTruncFloat64 = O.Xe)();
    a._BinaryenNearestFloat64 = () => (a._BinaryenNearestFloat64 = O.Ye)();
    a._BinaryenSqrtFloat64 = () => (a._BinaryenSqrtFloat64 = O.Ze)();
    a._BinaryenEqZInt64 = () => (a._BinaryenEqZInt64 = O._e)();
    a._BinaryenExtendSInt32 = () => (a._BinaryenExtendSInt32 = O.$e)();
    a._BinaryenExtendUInt32 = () => (a._BinaryenExtendUInt32 = O.af)();
    a._BinaryenWrapInt64 = () => (a._BinaryenWrapInt64 = O.bf)();
    a._BinaryenTruncSFloat32ToInt32 = () => (a._BinaryenTruncSFloat32ToInt32 = O.cf)();
    a._BinaryenTruncSFloat32ToInt64 = () => (a._BinaryenTruncSFloat32ToInt64 = O.df)();
    a._BinaryenTruncUFloat32ToInt32 = () => (a._BinaryenTruncUFloat32ToInt32 = O.ef)();
    a._BinaryenTruncUFloat32ToInt64 = () => (a._BinaryenTruncUFloat32ToInt64 = O.ff)();
    a._BinaryenTruncSFloat64ToInt32 = () => (a._BinaryenTruncSFloat64ToInt32 = O.gf)();
    a._BinaryenTruncSFloat64ToInt64 = () => (a._BinaryenTruncSFloat64ToInt64 = O.hf)();
    a._BinaryenTruncUFloat64ToInt32 = () => (a._BinaryenTruncUFloat64ToInt32 = O.jf)();
    a._BinaryenTruncUFloat64ToInt64 = () => (a._BinaryenTruncUFloat64ToInt64 = O.kf)();
    a._BinaryenReinterpretFloat32 = () => (a._BinaryenReinterpretFloat32 = O.lf)();
    a._BinaryenReinterpretFloat64 = () => (a._BinaryenReinterpretFloat64 = O.mf)();
    a._BinaryenExtendS8Int32 = () => (a._BinaryenExtendS8Int32 = O.nf)();
    a._BinaryenExtendS16Int32 = () => (a._BinaryenExtendS16Int32 = O.of)();
    a._BinaryenExtendS8Int64 = () => (a._BinaryenExtendS8Int64 = O.pf)();
    a._BinaryenExtendS16Int64 = () => (a._BinaryenExtendS16Int64 = O.qf)();
    a._BinaryenExtendS32Int64 = () => (a._BinaryenExtendS32Int64 = O.rf)();
    a._BinaryenConvertSInt32ToFloat32 = () => (a._BinaryenConvertSInt32ToFloat32 = O.sf)();
    a._BinaryenConvertSInt32ToFloat64 = () => (a._BinaryenConvertSInt32ToFloat64 = O.tf)();
    a._BinaryenConvertUInt32ToFloat32 = () => (a._BinaryenConvertUInt32ToFloat32 = O.uf)();
    a._BinaryenConvertUInt32ToFloat64 = () => (a._BinaryenConvertUInt32ToFloat64 = O.vf)();
    a._BinaryenConvertSInt64ToFloat32 = () => (a._BinaryenConvertSInt64ToFloat32 = O.wf)();
    a._BinaryenConvertSInt64ToFloat64 = () => (a._BinaryenConvertSInt64ToFloat64 = O.xf)();
    a._BinaryenConvertUInt64ToFloat32 = () => (a._BinaryenConvertUInt64ToFloat32 = O.yf)();
    a._BinaryenConvertUInt64ToFloat64 = () => (a._BinaryenConvertUInt64ToFloat64 = O.zf)();
    a._BinaryenPromoteFloat32 = () => (a._BinaryenPromoteFloat32 = O.Af)();
    a._BinaryenDemoteFloat64 = () => (a._BinaryenDemoteFloat64 = O.Bf)();
    a._BinaryenReinterpretInt32 = () => (a._BinaryenReinterpretInt32 = O.Cf)();
    a._BinaryenReinterpretInt64 = () => (a._BinaryenReinterpretInt64 = O.Df)();
    a._BinaryenAddInt32 = () => (a._BinaryenAddInt32 = O.Ef)();
    a._BinaryenSubInt32 = () => (a._BinaryenSubInt32 = O.Ff)();
    a._BinaryenMulInt32 = () => (a._BinaryenMulInt32 = O.Gf)();
    a._BinaryenDivSInt32 = () => (a._BinaryenDivSInt32 = O.Hf)();
    a._BinaryenDivUInt32 = () => (a._BinaryenDivUInt32 = O.If)();
    a._BinaryenRemSInt32 = () => (a._BinaryenRemSInt32 = O.Jf)();
    a._BinaryenRemUInt32 = () => (a._BinaryenRemUInt32 = O.Kf)();
    a._BinaryenAndInt32 = () => (a._BinaryenAndInt32 = O.Lf)();
    a._BinaryenOrInt32 = () => (a._BinaryenOrInt32 = O.Mf)();
    a._BinaryenXorInt32 = () => (a._BinaryenXorInt32 = O.Nf)();
    a._BinaryenShlInt32 = () => (a._BinaryenShlInt32 = O.Of)();
    a._BinaryenShrUInt32 = () => (a._BinaryenShrUInt32 = O.Pf)();
    a._BinaryenShrSInt32 = () => (a._BinaryenShrSInt32 = O.Qf)();
    a._BinaryenRotLInt32 = () => (a._BinaryenRotLInt32 = O.Rf)();
    a._BinaryenRotRInt32 = () => (a._BinaryenRotRInt32 = O.Sf)();
    a._BinaryenEqInt32 = () => (a._BinaryenEqInt32 = O.Tf)();
    a._BinaryenNeInt32 = () => (a._BinaryenNeInt32 = O.Uf)();
    a._BinaryenLtSInt32 = () => (a._BinaryenLtSInt32 = O.Vf)();
    a._BinaryenLtUInt32 = () => (a._BinaryenLtUInt32 = O.Wf)();
    a._BinaryenLeSInt32 = () => (a._BinaryenLeSInt32 = O.Xf)();
    a._BinaryenLeUInt32 = () => (a._BinaryenLeUInt32 = O.Yf)();
    a._BinaryenGtSInt32 = () => (a._BinaryenGtSInt32 = O.Zf)();
    a._BinaryenGtUInt32 = () => (a._BinaryenGtUInt32 = O._f)();
    a._BinaryenGeSInt32 = () => (a._BinaryenGeSInt32 = O.$f)();
    a._BinaryenGeUInt32 = () => (a._BinaryenGeUInt32 = O.ag)();
    a._BinaryenAddInt64 = () => (a._BinaryenAddInt64 = O.bg)();
    a._BinaryenSubInt64 = () => (a._BinaryenSubInt64 = O.cg)();
    a._BinaryenMulInt64 = () => (a._BinaryenMulInt64 = O.dg)();
    a._BinaryenDivSInt64 = () => (a._BinaryenDivSInt64 = O.eg)();
    a._BinaryenDivUInt64 = () => (a._BinaryenDivUInt64 = O.fg)();
    a._BinaryenRemSInt64 = () => (a._BinaryenRemSInt64 = O.gg)();
    a._BinaryenRemUInt64 = () => (a._BinaryenRemUInt64 = O.hg)();
    a._BinaryenAndInt64 = () => (a._BinaryenAndInt64 = O.ig)();
    a._BinaryenOrInt64 = () => (a._BinaryenOrInt64 = O.jg)();
    a._BinaryenXorInt64 = () => (a._BinaryenXorInt64 = O.kg)();
    a._BinaryenShlInt64 = () => (a._BinaryenShlInt64 = O.lg)();
    a._BinaryenShrUInt64 = () => (a._BinaryenShrUInt64 = O.mg)();
    a._BinaryenShrSInt64 = () => (a._BinaryenShrSInt64 = O.ng)();
    a._BinaryenRotLInt64 = () => (a._BinaryenRotLInt64 = O.og)();
    a._BinaryenRotRInt64 = () => (a._BinaryenRotRInt64 = O.pg)();
    a._BinaryenEqInt64 = () => (a._BinaryenEqInt64 = O.qg)();
    a._BinaryenNeInt64 = () => (a._BinaryenNeInt64 = O.rg)();
    a._BinaryenLtSInt64 = () => (a._BinaryenLtSInt64 = O.sg)();
    a._BinaryenLtUInt64 = () => (a._BinaryenLtUInt64 = O.tg)();
    a._BinaryenLeSInt64 = () => (a._BinaryenLeSInt64 = O.ug)();
    a._BinaryenLeUInt64 = () => (a._BinaryenLeUInt64 = O.vg)();
    a._BinaryenGtSInt64 = () => (a._BinaryenGtSInt64 = O.wg)();
    a._BinaryenGtUInt64 = () => (a._BinaryenGtUInt64 = O.xg)();
    a._BinaryenGeSInt64 = () => (a._BinaryenGeSInt64 = O.yg)();
    a._BinaryenGeUInt64 = () => (a._BinaryenGeUInt64 = O.zg)();
    a._BinaryenAddFloat32 = () => (a._BinaryenAddFloat32 = O.Ag)();
    a._BinaryenSubFloat32 = () => (a._BinaryenSubFloat32 = O.Bg)();
    a._BinaryenMulFloat32 = () => (a._BinaryenMulFloat32 = O.Cg)();
    a._BinaryenDivFloat32 = () => (a._BinaryenDivFloat32 = O.Dg)();
    a._BinaryenCopySignFloat32 = () => (a._BinaryenCopySignFloat32 = O.Eg)();
    a._BinaryenMinFloat32 = () => (a._BinaryenMinFloat32 = O.Fg)();
    a._BinaryenMaxFloat32 = () => (a._BinaryenMaxFloat32 = O.Gg)();
    a._BinaryenEqFloat32 = () => (a._BinaryenEqFloat32 = O.Hg)();
    a._BinaryenNeFloat32 = () => (a._BinaryenNeFloat32 = O.Ig)();
    a._BinaryenLtFloat32 = () => (a._BinaryenLtFloat32 = O.Jg)();
    a._BinaryenLeFloat32 = () => (a._BinaryenLeFloat32 = O.Kg)();
    a._BinaryenGtFloat32 = () => (a._BinaryenGtFloat32 = O.Lg)();
    a._BinaryenGeFloat32 = () => (a._BinaryenGeFloat32 = O.Mg)();
    a._BinaryenAddFloat64 = () => (a._BinaryenAddFloat64 = O.Ng)();
    a._BinaryenSubFloat64 = () => (a._BinaryenSubFloat64 = O.Og)();
    a._BinaryenMulFloat64 = () => (a._BinaryenMulFloat64 = O.Pg)();
    a._BinaryenDivFloat64 = () => (a._BinaryenDivFloat64 = O.Qg)();
    a._BinaryenCopySignFloat64 = () => (a._BinaryenCopySignFloat64 = O.Rg)();
    a._BinaryenMinFloat64 = () => (a._BinaryenMinFloat64 = O.Sg)();
    a._BinaryenMaxFloat64 = () => (a._BinaryenMaxFloat64 = O.Tg)();
    a._BinaryenEqFloat64 = () => (a._BinaryenEqFloat64 = O.Ug)();
    a._BinaryenNeFloat64 = () => (a._BinaryenNeFloat64 = O.Vg)();
    a._BinaryenLtFloat64 = () => (a._BinaryenLtFloat64 = O.Wg)();
    a._BinaryenLeFloat64 = () => (a._BinaryenLeFloat64 = O.Xg)();
    a._BinaryenGtFloat64 = () => (a._BinaryenGtFloat64 = O.Yg)();
    a._BinaryenGeFloat64 = () => (a._BinaryenGeFloat64 = O.Zg)();
    a._BinaryenAtomicRMWAdd = () => (a._BinaryenAtomicRMWAdd = O._g)();
    a._BinaryenAtomicRMWSub = () => (a._BinaryenAtomicRMWSub = O.$g)();
    a._BinaryenAtomicRMWAnd = () => (a._BinaryenAtomicRMWAnd = O.ah)();
    a._BinaryenAtomicRMWOr = () => (a._BinaryenAtomicRMWOr = O.bh)();
    a._BinaryenAtomicRMWXor = () => (a._BinaryenAtomicRMWXor = O.ch)();
    a._BinaryenAtomicRMWXchg = () => (a._BinaryenAtomicRMWXchg = O.dh)();
    a._BinaryenTruncSatSFloat32ToInt32 = () => (a._BinaryenTruncSatSFloat32ToInt32 = O.eh)();
    a._BinaryenTruncSatSFloat32ToInt64 = () => (a._BinaryenTruncSatSFloat32ToInt64 = O.fh)();
    a._BinaryenTruncSatUFloat32ToInt32 = () => (a._BinaryenTruncSatUFloat32ToInt32 = O.gh)();
    a._BinaryenTruncSatUFloat32ToInt64 = () => (a._BinaryenTruncSatUFloat32ToInt64 = O.hh)();
    a._BinaryenTruncSatSFloat64ToInt32 = () => (a._BinaryenTruncSatSFloat64ToInt32 = O.ih)();
    a._BinaryenTruncSatSFloat64ToInt64 = () => (a._BinaryenTruncSatSFloat64ToInt64 = O.jh)();
    a._BinaryenTruncSatUFloat64ToInt32 = () => (a._BinaryenTruncSatUFloat64ToInt32 = O.kh)();
    a._BinaryenTruncSatUFloat64ToInt64 = () => (a._BinaryenTruncSatUFloat64ToInt64 = O.lh)();
    a._BinaryenSplatVecI8x16 = () => (a._BinaryenSplatVecI8x16 = O.mh)();
    a._BinaryenExtractLaneSVecI8x16 = () => (a._BinaryenExtractLaneSVecI8x16 = O.nh)();
    a._BinaryenExtractLaneUVecI8x16 = () => (a._BinaryenExtractLaneUVecI8x16 = O.oh)();
    a._BinaryenReplaceLaneVecI8x16 = () => (a._BinaryenReplaceLaneVecI8x16 = O.ph)();
    a._BinaryenSplatVecI16x8 = () => (a._BinaryenSplatVecI16x8 = O.qh)();
    a._BinaryenExtractLaneSVecI16x8 = () => (a._BinaryenExtractLaneSVecI16x8 = O.rh)();
    a._BinaryenExtractLaneUVecI16x8 = () => (a._BinaryenExtractLaneUVecI16x8 = O.sh)();
    a._BinaryenReplaceLaneVecI16x8 = () => (a._BinaryenReplaceLaneVecI16x8 = O.th)();
    a._BinaryenSplatVecI32x4 = () => (a._BinaryenSplatVecI32x4 = O.uh)();
    a._BinaryenExtractLaneVecI32x4 = () => (a._BinaryenExtractLaneVecI32x4 = O.vh)();
    a._BinaryenReplaceLaneVecI32x4 = () => (a._BinaryenReplaceLaneVecI32x4 = O.wh)();
    a._BinaryenSplatVecI64x2 = () => (a._BinaryenSplatVecI64x2 = O.xh)();
    a._BinaryenExtractLaneVecI64x2 = () => (a._BinaryenExtractLaneVecI64x2 = O.yh)();
    a._BinaryenReplaceLaneVecI64x2 = () => (a._BinaryenReplaceLaneVecI64x2 = O.zh)();
    a._BinaryenSplatVecF32x4 = () => (a._BinaryenSplatVecF32x4 = O.Ah)();
    a._BinaryenExtractLaneVecF32x4 = () => (a._BinaryenExtractLaneVecF32x4 = O.Bh)();
    a._BinaryenReplaceLaneVecF32x4 = () => (a._BinaryenReplaceLaneVecF32x4 = O.Ch)();
    a._BinaryenSplatVecF64x2 = () => (a._BinaryenSplatVecF64x2 = O.Dh)();
    a._BinaryenExtractLaneVecF64x2 = () => (a._BinaryenExtractLaneVecF64x2 = O.Eh)();
    a._BinaryenReplaceLaneVecF64x2 = () => (a._BinaryenReplaceLaneVecF64x2 = O.Fh)();
    a._BinaryenEqVecI8x16 = () => (a._BinaryenEqVecI8x16 = O.Gh)();
    a._BinaryenNeVecI8x16 = () => (a._BinaryenNeVecI8x16 = O.Hh)();
    a._BinaryenLtSVecI8x16 = () => (a._BinaryenLtSVecI8x16 = O.Ih)();
    a._BinaryenLtUVecI8x16 = () => (a._BinaryenLtUVecI8x16 = O.Jh)();
    a._BinaryenGtSVecI8x16 = () => (a._BinaryenGtSVecI8x16 = O.Kh)();
    a._BinaryenGtUVecI8x16 = () => (a._BinaryenGtUVecI8x16 = O.Lh)();
    a._BinaryenLeSVecI8x16 = () => (a._BinaryenLeSVecI8x16 = O.Mh)();
    a._BinaryenLeUVecI8x16 = () => (a._BinaryenLeUVecI8x16 = O.Nh)();
    a._BinaryenGeSVecI8x16 = () => (a._BinaryenGeSVecI8x16 = O.Oh)();
    a._BinaryenGeUVecI8x16 = () => (a._BinaryenGeUVecI8x16 = O.Ph)();
    a._BinaryenEqVecI16x8 = () => (a._BinaryenEqVecI16x8 = O.Qh)();
    a._BinaryenNeVecI16x8 = () => (a._BinaryenNeVecI16x8 = O.Rh)();
    a._BinaryenLtSVecI16x8 = () => (a._BinaryenLtSVecI16x8 = O.Sh)();
    a._BinaryenLtUVecI16x8 = () => (a._BinaryenLtUVecI16x8 = O.Th)();
    a._BinaryenGtSVecI16x8 = () => (a._BinaryenGtSVecI16x8 = O.Uh)();
    a._BinaryenGtUVecI16x8 = () => (a._BinaryenGtUVecI16x8 = O.Vh)();
    a._BinaryenLeSVecI16x8 = () => (a._BinaryenLeSVecI16x8 = O.Wh)();
    a._BinaryenLeUVecI16x8 = () => (a._BinaryenLeUVecI16x8 = O.Xh)();
    a._BinaryenGeSVecI16x8 = () => (a._BinaryenGeSVecI16x8 = O.Yh)();
    a._BinaryenGeUVecI16x8 = () => (a._BinaryenGeUVecI16x8 = O.Zh)();
    a._BinaryenEqVecI32x4 = () => (a._BinaryenEqVecI32x4 = O._h)();
    a._BinaryenNeVecI32x4 = () => (a._BinaryenNeVecI32x4 = O.$h)();
    a._BinaryenLtSVecI32x4 = () => (a._BinaryenLtSVecI32x4 = O.ai)();
    a._BinaryenLtUVecI32x4 = () => (a._BinaryenLtUVecI32x4 = O.bi)();
    a._BinaryenGtSVecI32x4 = () => (a._BinaryenGtSVecI32x4 = O.ci)();
    a._BinaryenGtUVecI32x4 = () => (a._BinaryenGtUVecI32x4 = O.di)();
    a._BinaryenLeSVecI32x4 = () => (a._BinaryenLeSVecI32x4 = O.ei)();
    a._BinaryenLeUVecI32x4 = () => (a._BinaryenLeUVecI32x4 = O.fi)();
    a._BinaryenGeSVecI32x4 = () => (a._BinaryenGeSVecI32x4 = O.gi)();
    a._BinaryenGeUVecI32x4 = () => (a._BinaryenGeUVecI32x4 = O.hi)();
    a._BinaryenEqVecI64x2 = () => (a._BinaryenEqVecI64x2 = O.ii)();
    a._BinaryenNeVecI64x2 = () => (a._BinaryenNeVecI64x2 = O.ji)();
    a._BinaryenLtSVecI64x2 = () => (a._BinaryenLtSVecI64x2 = O.ki)();
    a._BinaryenGtSVecI64x2 = () => (a._BinaryenGtSVecI64x2 = O.li)();
    a._BinaryenLeSVecI64x2 = () => (a._BinaryenLeSVecI64x2 = O.mi)();
    a._BinaryenGeSVecI64x2 = () => (a._BinaryenGeSVecI64x2 = O.ni)();
    a._BinaryenEqVecF32x4 = () => (a._BinaryenEqVecF32x4 = O.oi)();
    a._BinaryenNeVecF32x4 = () => (a._BinaryenNeVecF32x4 = O.pi)();
    a._BinaryenLtVecF32x4 = () => (a._BinaryenLtVecF32x4 = O.qi)();
    a._BinaryenGtVecF32x4 = () => (a._BinaryenGtVecF32x4 = O.ri)();
    a._BinaryenLeVecF32x4 = () => (a._BinaryenLeVecF32x4 = O.si)();
    a._BinaryenGeVecF32x4 = () => (a._BinaryenGeVecF32x4 = O.ti)();
    a._BinaryenEqVecF64x2 = () => (a._BinaryenEqVecF64x2 = O.ui)();
    a._BinaryenNeVecF64x2 = () => (a._BinaryenNeVecF64x2 = O.vi)();
    a._BinaryenLtVecF64x2 = () => (a._BinaryenLtVecF64x2 = O.wi)();
    a._BinaryenGtVecF64x2 = () => (a._BinaryenGtVecF64x2 = O.xi)();
    a._BinaryenLeVecF64x2 = () => (a._BinaryenLeVecF64x2 = O.yi)();
    a._BinaryenGeVecF64x2 = () => (a._BinaryenGeVecF64x2 = O.zi)();
    a._BinaryenNotVec128 = () => (a._BinaryenNotVec128 = O.Ai)();
    a._BinaryenAndVec128 = () => (a._BinaryenAndVec128 = O.Bi)();
    a._BinaryenOrVec128 = () => (a._BinaryenOrVec128 = O.Ci)();
    a._BinaryenXorVec128 = () => (a._BinaryenXorVec128 = O.Di)();
    a._BinaryenAndNotVec128 = () => (a._BinaryenAndNotVec128 = O.Ei)();
    a._BinaryenBitselectVec128 = () => (a._BinaryenBitselectVec128 = O.Fi)();
    a._BinaryenRelaxedMaddVecF32x4 = () => (a._BinaryenRelaxedMaddVecF32x4 = O.Gi)();
    a._BinaryenRelaxedNmaddVecF32x4 = () => (a._BinaryenRelaxedNmaddVecF32x4 = O.Hi)();
    a._BinaryenRelaxedMaddVecF64x2 = () => (a._BinaryenRelaxedMaddVecF64x2 = O.Ii)();
    a._BinaryenRelaxedNmaddVecF64x2 = () => (a._BinaryenRelaxedNmaddVecF64x2 = O.Ji)();
    a._BinaryenLaneselectI8x16 = () => (a._BinaryenLaneselectI8x16 = O.Ki)();
    a._BinaryenLaneselectI16x8 = () => (a._BinaryenLaneselectI16x8 = O.Li)();
    a._BinaryenLaneselectI32x4 = () => (a._BinaryenLaneselectI32x4 = O.Mi)();
    a._BinaryenLaneselectI64x2 = () => (a._BinaryenLaneselectI64x2 = O.Ni)();
    a._BinaryenDotI8x16I7x16AddSToVecI32x4 = () =>
      (a._BinaryenDotI8x16I7x16AddSToVecI32x4 = O.Oi)();
    a._BinaryenAnyTrueVec128 = () => (a._BinaryenAnyTrueVec128 = O.Pi)();
    a._BinaryenAbsVecI8x16 = () => (a._BinaryenAbsVecI8x16 = O.Qi)();
    a._BinaryenNegVecI8x16 = () => (a._BinaryenNegVecI8x16 = O.Ri)();
    a._BinaryenAllTrueVecI8x16 = () => (a._BinaryenAllTrueVecI8x16 = O.Si)();
    a._BinaryenBitmaskVecI8x16 = () => (a._BinaryenBitmaskVecI8x16 = O.Ti)();
    a._BinaryenPopcntVecI8x16 = () => (a._BinaryenPopcntVecI8x16 = O.Ui)();
    a._BinaryenShlVecI8x16 = () => (a._BinaryenShlVecI8x16 = O.Vi)();
    a._BinaryenShrSVecI8x16 = () => (a._BinaryenShrSVecI8x16 = O.Wi)();
    a._BinaryenShrUVecI8x16 = () => (a._BinaryenShrUVecI8x16 = O.Xi)();
    a._BinaryenAddVecI8x16 = () => (a._BinaryenAddVecI8x16 = O.Yi)();
    a._BinaryenAddSatSVecI8x16 = () => (a._BinaryenAddSatSVecI8x16 = O.Zi)();
    a._BinaryenAddSatUVecI8x16 = () => (a._BinaryenAddSatUVecI8x16 = O._i)();
    a._BinaryenSubVecI8x16 = () => (a._BinaryenSubVecI8x16 = O.$i)();
    a._BinaryenSubSatSVecI8x16 = () => (a._BinaryenSubSatSVecI8x16 = O.aj)();
    a._BinaryenSubSatUVecI8x16 = () => (a._BinaryenSubSatUVecI8x16 = O.bj)();
    a._BinaryenMinSVecI8x16 = () => (a._BinaryenMinSVecI8x16 = O.cj)();
    a._BinaryenMinUVecI8x16 = () => (a._BinaryenMinUVecI8x16 = O.dj)();
    a._BinaryenMaxSVecI8x16 = () => (a._BinaryenMaxSVecI8x16 = O.ej)();
    a._BinaryenMaxUVecI8x16 = () => (a._BinaryenMaxUVecI8x16 = O.fj)();
    a._BinaryenAvgrUVecI8x16 = () => (a._BinaryenAvgrUVecI8x16 = O.gj)();
    a._BinaryenAbsVecI16x8 = () => (a._BinaryenAbsVecI16x8 = O.hj)();
    a._BinaryenNegVecI16x8 = () => (a._BinaryenNegVecI16x8 = O.ij)();
    a._BinaryenAllTrueVecI16x8 = () => (a._BinaryenAllTrueVecI16x8 = O.jj)();
    a._BinaryenBitmaskVecI16x8 = () => (a._BinaryenBitmaskVecI16x8 = O.kj)();
    a._BinaryenShlVecI16x8 = () => (a._BinaryenShlVecI16x8 = O.lj)();
    a._BinaryenShrSVecI16x8 = () => (a._BinaryenShrSVecI16x8 = O.mj)();
    a._BinaryenShrUVecI16x8 = () => (a._BinaryenShrUVecI16x8 = O.nj)();
    a._BinaryenAddVecI16x8 = () => (a._BinaryenAddVecI16x8 = O.oj)();
    a._BinaryenAddSatSVecI16x8 = () => (a._BinaryenAddSatSVecI16x8 = O.pj)();
    a._BinaryenAddSatUVecI16x8 = () => (a._BinaryenAddSatUVecI16x8 = O.qj)();
    a._BinaryenSubVecI16x8 = () => (a._BinaryenSubVecI16x8 = O.rj)();
    a._BinaryenSubSatSVecI16x8 = () => (a._BinaryenSubSatSVecI16x8 = O.sj)();
    a._BinaryenSubSatUVecI16x8 = () => (a._BinaryenSubSatUVecI16x8 = O.tj)();
    a._BinaryenMulVecI16x8 = () => (a._BinaryenMulVecI16x8 = O.uj)();
    a._BinaryenMinSVecI16x8 = () => (a._BinaryenMinSVecI16x8 = O.vj)();
    a._BinaryenMinUVecI16x8 = () => (a._BinaryenMinUVecI16x8 = O.wj)();
    a._BinaryenMaxSVecI16x8 = () => (a._BinaryenMaxSVecI16x8 = O.xj)();
    a._BinaryenMaxUVecI16x8 = () => (a._BinaryenMaxUVecI16x8 = O.yj)();
    a._BinaryenAvgrUVecI16x8 = () => (a._BinaryenAvgrUVecI16x8 = O.zj)();
    a._BinaryenQ15MulrSatSVecI16x8 = () => (a._BinaryenQ15MulrSatSVecI16x8 = O.Aj)();
    a._BinaryenExtMulLowSVecI16x8 = () => (a._BinaryenExtMulLowSVecI16x8 = O.Bj)();
    a._BinaryenExtMulHighSVecI16x8 = () => (a._BinaryenExtMulHighSVecI16x8 = O.Cj)();
    a._BinaryenExtMulLowUVecI16x8 = () => (a._BinaryenExtMulLowUVecI16x8 = O.Dj)();
    a._BinaryenExtMulHighUVecI16x8 = () => (a._BinaryenExtMulHighUVecI16x8 = O.Ej)();
    a._BinaryenAbsVecI32x4 = () => (a._BinaryenAbsVecI32x4 = O.Fj)();
    a._BinaryenNegVecI32x4 = () => (a._BinaryenNegVecI32x4 = O.Gj)();
    a._BinaryenAllTrueVecI32x4 = () => (a._BinaryenAllTrueVecI32x4 = O.Hj)();
    a._BinaryenBitmaskVecI32x4 = () => (a._BinaryenBitmaskVecI32x4 = O.Ij)();
    a._BinaryenShlVecI32x4 = () => (a._BinaryenShlVecI32x4 = O.Jj)();
    a._BinaryenShrSVecI32x4 = () => (a._BinaryenShrSVecI32x4 = O.Kj)();
    a._BinaryenShrUVecI32x4 = () => (a._BinaryenShrUVecI32x4 = O.Lj)();
    a._BinaryenAddVecI32x4 = () => (a._BinaryenAddVecI32x4 = O.Mj)();
    a._BinaryenSubVecI32x4 = () => (a._BinaryenSubVecI32x4 = O.Nj)();
    a._BinaryenMulVecI32x4 = () => (a._BinaryenMulVecI32x4 = O.Oj)();
    a._BinaryenMinSVecI32x4 = () => (a._BinaryenMinSVecI32x4 = O.Pj)();
    a._BinaryenMinUVecI32x4 = () => (a._BinaryenMinUVecI32x4 = O.Qj)();
    a._BinaryenMaxSVecI32x4 = () => (a._BinaryenMaxSVecI32x4 = O.Rj)();
    a._BinaryenMaxUVecI32x4 = () => (a._BinaryenMaxUVecI32x4 = O.Sj)();
    a._BinaryenDotSVecI16x8ToVecI32x4 = () => (a._BinaryenDotSVecI16x8ToVecI32x4 = O.Tj)();
    a._BinaryenExtMulLowSVecI32x4 = () => (a._BinaryenExtMulLowSVecI32x4 = O.Uj)();
    a._BinaryenExtMulHighSVecI32x4 = () => (a._BinaryenExtMulHighSVecI32x4 = O.Vj)();
    a._BinaryenExtMulLowUVecI32x4 = () => (a._BinaryenExtMulLowUVecI32x4 = O.Wj)();
    a._BinaryenExtMulHighUVecI32x4 = () => (a._BinaryenExtMulHighUVecI32x4 = O.Xj)();
    a._BinaryenAbsVecI64x2 = () => (a._BinaryenAbsVecI64x2 = O.Yj)();
    a._BinaryenNegVecI64x2 = () => (a._BinaryenNegVecI64x2 = O.Zj)();
    a._BinaryenAllTrueVecI64x2 = () => (a._BinaryenAllTrueVecI64x2 = O._j)();
    a._BinaryenBitmaskVecI64x2 = () => (a._BinaryenBitmaskVecI64x2 = O.$j)();
    a._BinaryenShlVecI64x2 = () => (a._BinaryenShlVecI64x2 = O.ak)();
    a._BinaryenShrSVecI64x2 = () => (a._BinaryenShrSVecI64x2 = O.bk)();
    a._BinaryenShrUVecI64x2 = () => (a._BinaryenShrUVecI64x2 = O.ck)();
    a._BinaryenAddVecI64x2 = () => (a._BinaryenAddVecI64x2 = O.dk)();
    a._BinaryenSubVecI64x2 = () => (a._BinaryenSubVecI64x2 = O.ek)();
    a._BinaryenMulVecI64x2 = () => (a._BinaryenMulVecI64x2 = O.fk)();
    a._BinaryenExtMulLowSVecI64x2 = () => (a._BinaryenExtMulLowSVecI64x2 = O.gk)();
    a._BinaryenExtMulHighSVecI64x2 = () => (a._BinaryenExtMulHighSVecI64x2 = O.hk)();
    a._BinaryenExtMulLowUVecI64x2 = () => (a._BinaryenExtMulLowUVecI64x2 = O.ik)();
    a._BinaryenExtMulHighUVecI64x2 = () => (a._BinaryenExtMulHighUVecI64x2 = O.jk)();
    a._BinaryenAbsVecF32x4 = () => (a._BinaryenAbsVecF32x4 = O.kk)();
    a._BinaryenNegVecF32x4 = () => (a._BinaryenNegVecF32x4 = O.lk)();
    a._BinaryenSqrtVecF32x4 = () => (a._BinaryenSqrtVecF32x4 = O.mk)();
    a._BinaryenAddVecF32x4 = () => (a._BinaryenAddVecF32x4 = O.nk)();
    a._BinaryenSubVecF32x4 = () => (a._BinaryenSubVecF32x4 = O.ok)();
    a._BinaryenMulVecF32x4 = () => (a._BinaryenMulVecF32x4 = O.pk)();
    a._BinaryenDivVecF32x4 = () => (a._BinaryenDivVecF32x4 = O.qk)();
    a._BinaryenMinVecF32x4 = () => (a._BinaryenMinVecF32x4 = O.rk)();
    a._BinaryenMaxVecF32x4 = () => (a._BinaryenMaxVecF32x4 = O.sk)();
    a._BinaryenPMinVecF32x4 = () => (a._BinaryenPMinVecF32x4 = O.tk)();
    a._BinaryenCeilVecF32x4 = () => (a._BinaryenCeilVecF32x4 = O.uk)();
    a._BinaryenFloorVecF32x4 = () => (a._BinaryenFloorVecF32x4 = O.vk)();
    a._BinaryenTruncVecF32x4 = () => (a._BinaryenTruncVecF32x4 = O.wk)();
    a._BinaryenNearestVecF32x4 = () => (a._BinaryenNearestVecF32x4 = O.xk)();
    a._BinaryenPMaxVecF32x4 = () => (a._BinaryenPMaxVecF32x4 = O.yk)();
    a._BinaryenAbsVecF64x2 = () => (a._BinaryenAbsVecF64x2 = O.zk)();
    a._BinaryenNegVecF64x2 = () => (a._BinaryenNegVecF64x2 = O.Ak)();
    a._BinaryenSqrtVecF64x2 = () => (a._BinaryenSqrtVecF64x2 = O.Bk)();
    a._BinaryenAddVecF64x2 = () => (a._BinaryenAddVecF64x2 = O.Ck)();
    a._BinaryenSubVecF64x2 = () => (a._BinaryenSubVecF64x2 = O.Dk)();
    a._BinaryenMulVecF64x2 = () => (a._BinaryenMulVecF64x2 = O.Ek)();
    a._BinaryenDivVecF64x2 = () => (a._BinaryenDivVecF64x2 = O.Fk)();
    a._BinaryenMinVecF64x2 = () => (a._BinaryenMinVecF64x2 = O.Gk)();
    a._BinaryenMaxVecF64x2 = () => (a._BinaryenMaxVecF64x2 = O.Hk)();
    a._BinaryenPMinVecF64x2 = () => (a._BinaryenPMinVecF64x2 = O.Ik)();
    a._BinaryenPMaxVecF64x2 = () => (a._BinaryenPMaxVecF64x2 = O.Jk)();
    a._BinaryenCeilVecF64x2 = () => (a._BinaryenCeilVecF64x2 = O.Kk)();
    a._BinaryenFloorVecF64x2 = () => (a._BinaryenFloorVecF64x2 = O.Lk)();
    a._BinaryenTruncVecF64x2 = () => (a._BinaryenTruncVecF64x2 = O.Mk)();
    a._BinaryenNearestVecF64x2 = () => (a._BinaryenNearestVecF64x2 = O.Nk)();
    a._BinaryenExtAddPairwiseSVecI8x16ToI16x8 = () =>
      (a._BinaryenExtAddPairwiseSVecI8x16ToI16x8 = O.Ok)();
    a._BinaryenExtAddPairwiseUVecI8x16ToI16x8 = () =>
      (a._BinaryenExtAddPairwiseUVecI8x16ToI16x8 = O.Pk)();
    a._BinaryenExtAddPairwiseSVecI16x8ToI32x4 = () =>
      (a._BinaryenExtAddPairwiseSVecI16x8ToI32x4 = O.Qk)();
    a._BinaryenExtAddPairwiseUVecI16x8ToI32x4 = () =>
      (a._BinaryenExtAddPairwiseUVecI16x8ToI32x4 = O.Rk)();
    a._BinaryenTruncSatSVecF32x4ToVecI32x4 = () =>
      (a._BinaryenTruncSatSVecF32x4ToVecI32x4 = O.Sk)();
    a._BinaryenTruncSatUVecF32x4ToVecI32x4 = () =>
      (a._BinaryenTruncSatUVecF32x4ToVecI32x4 = O.Tk)();
    a._BinaryenConvertSVecI32x4ToVecF32x4 = () => (a._BinaryenConvertSVecI32x4ToVecF32x4 = O.Uk)();
    a._BinaryenConvertUVecI32x4ToVecF32x4 = () => (a._BinaryenConvertUVecI32x4ToVecF32x4 = O.Vk)();
    a._BinaryenLoad8SplatVec128 = () => (a._BinaryenLoad8SplatVec128 = O.Wk)();
    a._BinaryenLoad16SplatVec128 = () => (a._BinaryenLoad16SplatVec128 = O.Xk)();
    a._BinaryenLoad32SplatVec128 = () => (a._BinaryenLoad32SplatVec128 = O.Yk)();
    a._BinaryenLoad64SplatVec128 = () => (a._BinaryenLoad64SplatVec128 = O.Zk)();
    a._BinaryenLoad8x8SVec128 = () => (a._BinaryenLoad8x8SVec128 = O._k)();
    a._BinaryenLoad8x8UVec128 = () => (a._BinaryenLoad8x8UVec128 = O.$k)();
    a._BinaryenLoad16x4SVec128 = () => (a._BinaryenLoad16x4SVec128 = O.al)();
    a._BinaryenLoad16x4UVec128 = () => (a._BinaryenLoad16x4UVec128 = O.bl)();
    a._BinaryenLoad32x2SVec128 = () => (a._BinaryenLoad32x2SVec128 = O.cl)();
    a._BinaryenLoad32x2UVec128 = () => (a._BinaryenLoad32x2UVec128 = O.dl)();
    a._BinaryenLoad32ZeroVec128 = () => (a._BinaryenLoad32ZeroVec128 = O.el)();
    a._BinaryenLoad64ZeroVec128 = () => (a._BinaryenLoad64ZeroVec128 = O.fl)();
    a._BinaryenLoad8LaneVec128 = () => (a._BinaryenLoad8LaneVec128 = O.gl)();
    a._BinaryenLoad16LaneVec128 = () => (a._BinaryenLoad16LaneVec128 = O.hl)();
    a._BinaryenLoad32LaneVec128 = () => (a._BinaryenLoad32LaneVec128 = O.il)();
    a._BinaryenLoad64LaneVec128 = () => (a._BinaryenLoad64LaneVec128 = O.jl)();
    a._BinaryenStore8LaneVec128 = () => (a._BinaryenStore8LaneVec128 = O.kl)();
    a._BinaryenStore16LaneVec128 = () => (a._BinaryenStore16LaneVec128 = O.ll)();
    a._BinaryenStore32LaneVec128 = () => (a._BinaryenStore32LaneVec128 = O.ml)();
    a._BinaryenStore64LaneVec128 = () => (a._BinaryenStore64LaneVec128 = O.nl)();
    a._BinaryenNarrowSVecI16x8ToVecI8x16 = () => (a._BinaryenNarrowSVecI16x8ToVecI8x16 = O.ol)();
    a._BinaryenNarrowUVecI16x8ToVecI8x16 = () => (a._BinaryenNarrowUVecI16x8ToVecI8x16 = O.pl)();
    a._BinaryenNarrowSVecI32x4ToVecI16x8 = () => (a._BinaryenNarrowSVecI32x4ToVecI16x8 = O.ql)();
    a._BinaryenNarrowUVecI32x4ToVecI16x8 = () => (a._BinaryenNarrowUVecI32x4ToVecI16x8 = O.rl)();
    a._BinaryenExtendLowSVecI8x16ToVecI16x8 = () =>
      (a._BinaryenExtendLowSVecI8x16ToVecI16x8 = O.sl)();
    a._BinaryenExtendHighSVecI8x16ToVecI16x8 = () =>
      (a._BinaryenExtendHighSVecI8x16ToVecI16x8 = O.tl)();
    a._BinaryenExtendLowUVecI8x16ToVecI16x8 = () =>
      (a._BinaryenExtendLowUVecI8x16ToVecI16x8 = O.ul)();
    a._BinaryenExtendHighUVecI8x16ToVecI16x8 = () =>
      (a._BinaryenExtendHighUVecI8x16ToVecI16x8 = O.vl)();
    a._BinaryenExtendLowSVecI16x8ToVecI32x4 = () =>
      (a._BinaryenExtendLowSVecI16x8ToVecI32x4 = O.wl)();
    a._BinaryenExtendHighSVecI16x8ToVecI32x4 = () =>
      (a._BinaryenExtendHighSVecI16x8ToVecI32x4 = O.xl)();
    a._BinaryenExtendLowUVecI16x8ToVecI32x4 = () =>
      (a._BinaryenExtendLowUVecI16x8ToVecI32x4 = O.yl)();
    a._BinaryenExtendHighUVecI16x8ToVecI32x4 = () =>
      (a._BinaryenExtendHighUVecI16x8ToVecI32x4 = O.zl)();
    a._BinaryenExtendLowSVecI32x4ToVecI64x2 = () =>
      (a._BinaryenExtendLowSVecI32x4ToVecI64x2 = O.Al)();
    a._BinaryenExtendHighSVecI32x4ToVecI64x2 = () =>
      (a._BinaryenExtendHighSVecI32x4ToVecI64x2 = O.Bl)();
    a._BinaryenExtendLowUVecI32x4ToVecI64x2 = () =>
      (a._BinaryenExtendLowUVecI32x4ToVecI64x2 = O.Cl)();
    a._BinaryenExtendHighUVecI32x4ToVecI64x2 = () =>
      (a._BinaryenExtendHighUVecI32x4ToVecI64x2 = O.Dl)();
    a._BinaryenConvertLowSVecI32x4ToVecF64x2 = () =>
      (a._BinaryenConvertLowSVecI32x4ToVecF64x2 = O.El)();
    a._BinaryenConvertLowUVecI32x4ToVecF64x2 = () =>
      (a._BinaryenConvertLowUVecI32x4ToVecF64x2 = O.Fl)();
    a._BinaryenTruncSatZeroSVecF64x2ToVecI32x4 = () =>
      (a._BinaryenTruncSatZeroSVecF64x2ToVecI32x4 = O.Gl)();
    a._BinaryenTruncSatZeroUVecF64x2ToVecI32x4 = () =>
      (a._BinaryenTruncSatZeroUVecF64x2ToVecI32x4 = O.Hl)();
    a._BinaryenDemoteZeroVecF64x2ToVecF32x4 = () =>
      (a._BinaryenDemoteZeroVecF64x2ToVecF32x4 = O.Il)();
    a._BinaryenPromoteLowVecF32x4ToVecF64x2 = () =>
      (a._BinaryenPromoteLowVecF32x4ToVecF64x2 = O.Jl)();
    a._BinaryenRelaxedTruncSVecF32x4ToVecI32x4 = () =>
      (a._BinaryenRelaxedTruncSVecF32x4ToVecI32x4 = O.Kl)();
    a._BinaryenRelaxedTruncUVecF32x4ToVecI32x4 = () =>
      (a._BinaryenRelaxedTruncUVecF32x4ToVecI32x4 = O.Ll)();
    a._BinaryenRelaxedTruncZeroSVecF64x2ToVecI32x4 = () =>
      (a._BinaryenRelaxedTruncZeroSVecF64x2ToVecI32x4 = O.Ml)();
    a._BinaryenRelaxedTruncZeroUVecF64x2ToVecI32x4 = () =>
      (a._BinaryenRelaxedTruncZeroUVecF64x2ToVecI32x4 = O.Nl)();
    a._BinaryenSwizzleVecI8x16 = () => (a._BinaryenSwizzleVecI8x16 = O.Ol)();
    a._BinaryenRelaxedSwizzleVecI8x16 = () => (a._BinaryenRelaxedSwizzleVecI8x16 = O.Pl)();
    a._BinaryenRelaxedMinVecF32x4 = () => (a._BinaryenRelaxedMinVecF32x4 = O.Ql)();
    a._BinaryenRelaxedMaxVecF32x4 = () => (a._BinaryenRelaxedMaxVecF32x4 = O.Rl)();
    a._BinaryenRelaxedMinVecF64x2 = () => (a._BinaryenRelaxedMinVecF64x2 = O.Sl)();
    a._BinaryenRelaxedMaxVecF64x2 = () => (a._BinaryenRelaxedMaxVecF64x2 = O.Tl)();
    a._BinaryenRelaxedQ15MulrSVecI16x8 = () => (a._BinaryenRelaxedQ15MulrSVecI16x8 = O.Ul)();
    a._BinaryenDotI8x16I7x16SToVecI16x8 = () => (a._BinaryenDotI8x16I7x16SToVecI16x8 = O.Vl)();
    a._BinaryenRefAsNonNull = () => (a._BinaryenRefAsNonNull = O.Wl)();
    a._BinaryenRefAsExternInternalize = () => (a._BinaryenRefAsExternInternalize = O.Xl)();
    a._BinaryenRefAsExternExternalize = () => (a._BinaryenRefAsExternExternalize = O.Yl)();
    a._BinaryenRefAsAnyConvertExtern = () => (a._BinaryenRefAsAnyConvertExtern = O.Zl)();
    a._BinaryenRefAsExternConvertAny = () => (a._BinaryenRefAsExternConvertAny = O._l)();
    a._BinaryenBrOnNull = () => (a._BinaryenBrOnNull = O.$l)();
    a._BinaryenBrOnNonNull = () => (a._BinaryenBrOnNonNull = O.am)();
    a._BinaryenBrOnCast = () => (a._BinaryenBrOnCast = O.bm)();
    a._BinaryenBrOnCastFail = () => (a._BinaryenBrOnCastFail = O.cm)();
    a._BinaryenStringNewLossyUTF8Array = () => (a._BinaryenStringNewLossyUTF8Array = O.dm)();
    a._BinaryenStringNewWTF16Array = () => (a._BinaryenStringNewWTF16Array = O.em)();
    a._BinaryenStringNewFromCodePoint = () => (a._BinaryenStringNewFromCodePoint = O.fm)();
    a._BinaryenStringMeasureUTF8 = () => (a._BinaryenStringMeasureUTF8 = O.gm)();
    a._BinaryenStringMeasureWTF16 = () => (a._BinaryenStringMeasureWTF16 = O.hm)();
    a._BinaryenStringEncodeLossyUTF8Array = () => (a._BinaryenStringEncodeLossyUTF8Array = O.im)();
    a._BinaryenStringEncodeWTF16Array = () => (a._BinaryenStringEncodeWTF16Array = O.jm)();
    a._BinaryenStringEqEqual = () => (a._BinaryenStringEqEqual = O.km)();
    a._BinaryenStringEqCompare = () => (a._BinaryenStringEqCompare = O.lm)();
    a._BinaryenBlock = (b, c, g, d, f) => (a._BinaryenBlock = O.mm)(b, c, g, d, f);
    a._BinaryenIf = (b, c, g, d) => (a._BinaryenIf = O.nm)(b, c, g, d);
    a._BinaryenLoop = (b, c, g) => (a._BinaryenLoop = O.om)(b, c, g);
    a._BinaryenBreak = (b, c, g, d) => (a._BinaryenBreak = O.pm)(b, c, g, d);
    a._BinaryenSwitch = (b, c, g, d, f, h) => (a._BinaryenSwitch = O.qm)(b, c, g, d, f, h);
    a._BinaryenCall = (b, c, g, d, f) => (a._BinaryenCall = O.rm)(b, c, g, d, f);
    a._BinaryenReturnCall = (b, c, g, d, f) => (a._BinaryenReturnCall = O.sm)(b, c, g, d, f);
    a._BinaryenCallIndirect = (b, c, g, d, f, h, k) =>
      (a._BinaryenCallIndirect = O.tm)(b, c, g, d, f, h, k);
    a._BinaryenReturnCallIndirect = (b, c, g, d, f, h, k) =>
      (a._BinaryenReturnCallIndirect = O.um)(b, c, g, d, f, h, k);
    a._BinaryenLocalGet = (b, c, g) => (a._BinaryenLocalGet = O.vm)(b, c, g);
    a._BinaryenLocalSet = (b, c, g) => (a._BinaryenLocalSet = O.wm)(b, c, g);
    a._BinaryenLocalTee = (b, c, g, d) => (a._BinaryenLocalTee = O.xm)(b, c, g, d);
    a._BinaryenGlobalGet = (b, c, g) => (a._BinaryenGlobalGet = O.ym)(b, c, g);
    a._BinaryenGlobalSet = (b, c, g) => (a._BinaryenGlobalSet = O.zm)(b, c, g);
    a._BinaryenLoad = (b, c, g, d, f, h, k, l) => (a._BinaryenLoad = O.Am)(b, c, g, d, f, h, k, l);
    a._BinaryenStore = (b, c, g, d, f, h, k, l) =>
      (a._BinaryenStore = O.Bm)(b, c, g, d, f, h, k, l);
    a._BinaryenConst = (b, c) => (a._BinaryenConst = O.Cm)(b, c);
    a._BinaryenUnary = (b, c, g) => (a._BinaryenUnary = O.Dm)(b, c, g);
    a._BinaryenBinary = (b, c, g, d) => (a._BinaryenBinary = O.Em)(b, c, g, d);
    a._BinaryenSelect = (b, c, g, d) => (a._BinaryenSelect = O.Fm)(b, c, g, d);
    a._BinaryenDrop = (b, c) => (a._BinaryenDrop = O.Gm)(b, c);
    a._BinaryenReturn = (b, c) => (a._BinaryenReturn = O.Hm)(b, c);
    a._BinaryenMemorySize = (b, c, g) => (a._BinaryenMemorySize = O.Im)(b, c, g);
    a._BinaryenMemoryGrow = (b, c, g, d) => (a._BinaryenMemoryGrow = O.Jm)(b, c, g, d);
    a._BinaryenNop = b => (a._BinaryenNop = O.Km)(b);
    a._BinaryenUnreachable = b => (a._BinaryenUnreachable = O.Lm)(b);
    a._BinaryenAtomicLoad = (b, c, g, d, f, h) => (a._BinaryenAtomicLoad = O.Mm)(b, c, g, d, f, h);
    a._BinaryenAtomicStore = (b, c, g, d, f, h, k) =>
      (a._BinaryenAtomicStore = O.Nm)(b, c, g, d, f, h, k);
    a._BinaryenAtomicRMW = (b, c, g, d, f, h, k, l) =>
      (a._BinaryenAtomicRMW = O.Om)(b, c, g, d, f, h, k, l);
    a._BinaryenAtomicCmpxchg = (b, c, g, d, f, h, k, l) =>
      (a._BinaryenAtomicCmpxchg = O.Pm)(b, c, g, d, f, h, k, l);
    a._BinaryenAtomicWait = (b, c, g, d, f, h) => (a._BinaryenAtomicWait = O.Qm)(b, c, g, d, f, h);
    a._BinaryenAtomicNotify = (b, c, g, d) => (a._BinaryenAtomicNotify = O.Rm)(b, c, g, d);
    a._BinaryenAtomicFence = b => (a._BinaryenAtomicFence = O.Sm)(b);
    a._BinaryenSIMDExtract = (b, c, g, d) => (a._BinaryenSIMDExtract = O.Tm)(b, c, g, d);
    a._BinaryenSIMDReplace = (b, c, g, d, f) => (a._BinaryenSIMDReplace = O.Um)(b, c, g, d, f);
    a._BinaryenSIMDShuffle = (b, c, g, d) => (a._BinaryenSIMDShuffle = O.Vm)(b, c, g, d);
    a._BinaryenSIMDTernary = (b, c, g, d, f) => (a._BinaryenSIMDTernary = O.Wm)(b, c, g, d, f);
    a._BinaryenSIMDShift = (b, c, g, d) => (a._BinaryenSIMDShift = O.Xm)(b, c, g, d);
    a._BinaryenSIMDLoad = (b, c, g, d, f, h) => (a._BinaryenSIMDLoad = O.Ym)(b, c, g, d, f, h);
    a._BinaryenSIMDLoadStoreLane = (b, c, g, d, f, h, k, l) =>
      (a._BinaryenSIMDLoadStoreLane = O.Zm)(b, c, g, d, f, h, k, l);
    a._BinaryenMemoryInit = (b, c, g, d, f, h) => (a._BinaryenMemoryInit = O._m)(b, c, g, d, f, h);
    a._BinaryenDataDrop = (b, c) => (a._BinaryenDataDrop = O.$m)(b, c);
    a._BinaryenMemoryCopy = (b, c, g, d, f, h) => (a._BinaryenMemoryCopy = O.an)(b, c, g, d, f, h);
    a._BinaryenMemoryFill = (b, c, g, d, f) => (a._BinaryenMemoryFill = O.bn)(b, c, g, d, f);
    a._BinaryenTupleMake = (b, c, g) => (a._BinaryenTupleMake = O.cn)(b, c, g);
    a._BinaryenTupleExtract = (b, c, g) => (a._BinaryenTupleExtract = O.dn)(b, c, g);
    a._BinaryenPop = (b, c) => (a._BinaryenPop = O.en)(b, c);
    a._BinaryenRefNull = (b, c) => (a._BinaryenRefNull = O.fn)(b, c);
    a._BinaryenRefIsNull = (b, c) => (a._BinaryenRefIsNull = O.gn)(b, c);
    a._BinaryenRefAs = (b, c, g) => (a._BinaryenRefAs = O.hn)(b, c, g);
    a._BinaryenRefFunc = (b, c, g) => (a._BinaryenRefFunc = O.jn)(b, c, g);
    a._BinaryenRefEq = (b, c, g) => (a._BinaryenRefEq = O.kn)(b, c, g);
    a._BinaryenTableGet = (b, c, g, d) => (a._BinaryenTableGet = O.ln)(b, c, g, d);
    a._BinaryenTableSet = (b, c, g, d) => (a._BinaryenTableSet = O.mn)(b, c, g, d);
    a._BinaryenTableSize = (b, c) => (a._BinaryenTableSize = O.nn)(b, c);
    a._BinaryenTableGrow = (b, c, g, d) => (a._BinaryenTableGrow = O.on)(b, c, g, d);
    a._BinaryenTry = (b, c, g, d, f, h, k, l) => (a._BinaryenTry = O.pn)(b, c, g, d, f, h, k, l);
    a._BinaryenThrow = (b, c, g, d) => (a._BinaryenThrow = O.qn)(b, c, g, d);
    a._BinaryenRethrow = (b, c) => (a._BinaryenRethrow = O.rn)(b, c);
    a._BinaryenRefI31 = (b, c) => (a._BinaryenRefI31 = O.sn)(b, c);
    a._BinaryenI31Get = (b, c, g) => (a._BinaryenI31Get = O.tn)(b, c, g);
    a._BinaryenCallRef = (b, c, g, d, f, h) => (a._BinaryenCallRef = O.un)(b, c, g, d, f, h);
    a._BinaryenRefTest = (b, c, g) => (a._BinaryenRefTest = O.vn)(b, c, g);
    a._BinaryenRefCast = (b, c, g) => (a._BinaryenRefCast = O.wn)(b, c, g);
    a._BinaryenBrOn = (b, c, g, d, f) => (a._BinaryenBrOn = O.xn)(b, c, g, d, f);
    a._BinaryenStructNew = (b, c, g, d) => (a._BinaryenStructNew = O.yn)(b, c, g, d);
    a._BinaryenStructGet = (b, c, g, d, f) => (a._BinaryenStructGet = O.zn)(b, c, g, d, f);
    a._BinaryenStructSet = (b, c, g, d) => (a._BinaryenStructSet = O.An)(b, c, g, d);
    a._BinaryenArrayNew = (b, c, g, d) => (a._BinaryenArrayNew = O.Bn)(b, c, g, d);
    a._BinaryenArrayNewData = (b, c, g, d, f) => (a._BinaryenArrayNewData = O.Cn)(b, c, g, d, f);
    a._BinaryenArrayNewElem = (b, c, g, d, f) => (a._BinaryenArrayNewElem = O.Dn)(b, c, g, d, f);
    a._BinaryenArrayNewFixed = (b, c, g, d) => (a._BinaryenArrayNewFixed = O.En)(b, c, g, d);
    a._BinaryenArrayGet = (b, c, g, d, f) => (a._BinaryenArrayGet = O.Fn)(b, c, g, d, f);
    a._BinaryenArraySet = (b, c, g, d) => (a._BinaryenArraySet = O.Gn)(b, c, g, d);
    a._BinaryenArrayLen = (b, c) => (a._BinaryenArrayLen = O.Hn)(b, c);
    a._BinaryenArrayCopy = (b, c, g, d, f, h) => (a._BinaryenArrayCopy = O.In)(b, c, g, d, f, h);
    a._BinaryenArrayFill = (b, c, g, d, f) => (a._BinaryenArrayFill = O.Jn)(b, c, g, d, f);
    a._BinaryenArrayInitData = (b, c, g, d, f, h) =>
      (a._BinaryenArrayInitData = O.Kn)(b, c, g, d, f, h);
    a._BinaryenArrayInitElem = (b, c, g, d, f, h) =>
      (a._BinaryenArrayInitElem = O.Ln)(b, c, g, d, f, h);
    a._BinaryenStringNew = (b, c, g, d, f) => (a._BinaryenStringNew = O.Mn)(b, c, g, d, f);
    a._BinaryenStringConst = (b, c) => (a._BinaryenStringConst = O.Nn)(b, c);
    a._BinaryenStringMeasure = (b, c, g) => (a._BinaryenStringMeasure = O.On)(b, c, g);
    a._BinaryenStringEncode = (b, c, g, d, f) => (a._BinaryenStringEncode = O.Pn)(b, c, g, d, f);
    a._BinaryenStringConcat = (b, c, g) => (a._BinaryenStringConcat = O.Qn)(b, c, g);
    a._BinaryenStringEq = (b, c, g, d) => (a._BinaryenStringEq = O.Rn)(b, c, g, d);
    a._BinaryenStringWTF16Get = (b, c, g) => (a._BinaryenStringWTF16Get = O.Sn)(b, c, g);
    a._BinaryenStringSliceWTF = (b, c, g, d) => (a._BinaryenStringSliceWTF = O.Tn)(b, c, g, d);
    a._BinaryenExpressionGetId = b => (a._BinaryenExpressionGetId = O.Un)(b);
    a._BinaryenExpressionGetType = b => (a._BinaryenExpressionGetType = O.Vn)(b);
    a._BinaryenExpressionSetType = (b, c) => (a._BinaryenExpressionSetType = O.Wn)(b, c);
    a._BinaryenExpressionPrint = b => (a._BinaryenExpressionPrint = O.Xn)(b);
    a._BinaryenExpressionFinalize = b => (a._BinaryenExpressionFinalize = O.Yn)(b);
    a._BinaryenExpressionCopy = (b, c) => (a._BinaryenExpressionCopy = O.Zn)(b, c);
    a._BinaryenBlockGetName = b => (a._BinaryenBlockGetName = O._n)(b);
    a._BinaryenBlockSetName = (b, c) => (a._BinaryenBlockSetName = O.$n)(b, c);
    a._BinaryenBlockGetNumChildren = b => (a._BinaryenBlockGetNumChildren = O.ao)(b);
    a._BinaryenBlockGetChildAt = (b, c) => (a._BinaryenBlockGetChildAt = O.bo)(b, c);
    a._BinaryenBlockSetChildAt = (b, c, g) => (a._BinaryenBlockSetChildAt = O.co)(b, c, g);
    a._BinaryenBlockAppendChild = (b, c) => (a._BinaryenBlockAppendChild = O.eo)(b, c);
    a._BinaryenBlockInsertChildAt = (b, c, g) => (a._BinaryenBlockInsertChildAt = O.fo)(b, c, g);
    a._BinaryenBlockRemoveChildAt = (b, c) => (a._BinaryenBlockRemoveChildAt = O.go)(b, c);
    a._BinaryenIfGetCondition = b => (a._BinaryenIfGetCondition = O.ho)(b);
    a._BinaryenIfSetCondition = (b, c) => (a._BinaryenIfSetCondition = O.io)(b, c);
    a._BinaryenIfGetIfTrue = b => (a._BinaryenIfGetIfTrue = O.jo)(b);
    a._BinaryenIfSetIfTrue = (b, c) => (a._BinaryenIfSetIfTrue = O.ko)(b, c);
    a._BinaryenIfGetIfFalse = b => (a._BinaryenIfGetIfFalse = O.lo)(b);
    a._BinaryenIfSetIfFalse = (b, c) => (a._BinaryenIfSetIfFalse = O.mo)(b, c);
    a._BinaryenLoopGetName = b => (a._BinaryenLoopGetName = O.no)(b);
    a._BinaryenLoopSetName = (b, c) => (a._BinaryenLoopSetName = O.oo)(b, c);
    a._BinaryenLoopGetBody = b => (a._BinaryenLoopGetBody = O.po)(b);
    a._BinaryenLoopSetBody = (b, c) => (a._BinaryenLoopSetBody = O.qo)(b, c);
    a._BinaryenBreakGetName = b => (a._BinaryenBreakGetName = O.ro)(b);
    a._BinaryenBreakSetName = (b, c) => (a._BinaryenBreakSetName = O.so)(b, c);
    a._BinaryenBreakGetCondition = b => (a._BinaryenBreakGetCondition = O.to)(b);
    a._BinaryenBreakSetCondition = (b, c) => (a._BinaryenBreakSetCondition = O.uo)(b, c);
    a._BinaryenBreakGetValue = b => (a._BinaryenBreakGetValue = O.vo)(b);
    a._BinaryenBreakSetValue = (b, c) => (a._BinaryenBreakSetValue = O.wo)(b, c);
    a._BinaryenSwitchGetNumNames = b => (a._BinaryenSwitchGetNumNames = O.xo)(b);
    a._BinaryenSwitchGetNameAt = (b, c) => (a._BinaryenSwitchGetNameAt = O.yo)(b, c);
    a._BinaryenSwitchSetNameAt = (b, c, g) => (a._BinaryenSwitchSetNameAt = O.zo)(b, c, g);
    a._BinaryenSwitchAppendName = (b, c) => (a._BinaryenSwitchAppendName = O.Ao)(b, c);
    a._BinaryenSwitchInsertNameAt = (b, c, g) => (a._BinaryenSwitchInsertNameAt = O.Bo)(b, c, g);
    a._BinaryenSwitchRemoveNameAt = (b, c) => (a._BinaryenSwitchRemoveNameAt = O.Co)(b, c);
    a._BinaryenSwitchGetDefaultName = b => (a._BinaryenSwitchGetDefaultName = O.Do)(b);
    a._BinaryenSwitchSetDefaultName = (b, c) => (a._BinaryenSwitchSetDefaultName = O.Eo)(b, c);
    a._BinaryenSwitchGetCondition = b => (a._BinaryenSwitchGetCondition = O.Fo)(b);
    a._BinaryenSwitchSetCondition = (b, c) => (a._BinaryenSwitchSetCondition = O.Go)(b, c);
    a._BinaryenSwitchGetValue = b => (a._BinaryenSwitchGetValue = O.Ho)(b);
    a._BinaryenSwitchSetValue = (b, c) => (a._BinaryenSwitchSetValue = O.Io)(b, c);
    a._BinaryenCallGetTarget = b => (a._BinaryenCallGetTarget = O.Jo)(b);
    a._BinaryenCallSetTarget = (b, c) => (a._BinaryenCallSetTarget = O.Ko)(b, c);
    a._BinaryenCallGetNumOperands = b => (a._BinaryenCallGetNumOperands = O.Lo)(b);
    a._BinaryenCallGetOperandAt = (b, c) => (a._BinaryenCallGetOperandAt = O.Mo)(b, c);
    a._BinaryenCallSetOperandAt = (b, c, g) => (a._BinaryenCallSetOperandAt = O.No)(b, c, g);
    a._BinaryenCallAppendOperand = (b, c) => (a._BinaryenCallAppendOperand = O.Oo)(b, c);
    a._BinaryenCallInsertOperandAt = (b, c, g) => (a._BinaryenCallInsertOperandAt = O.Po)(b, c, g);
    a._BinaryenCallRemoveOperandAt = (b, c) => (a._BinaryenCallRemoveOperandAt = O.Qo)(b, c);
    a._BinaryenCallIsReturn = b => (a._BinaryenCallIsReturn = O.Ro)(b);
    a._BinaryenCallSetReturn = (b, c) => (a._BinaryenCallSetReturn = O.So)(b, c);
    a._BinaryenCallIndirectGetTarget = b => (a._BinaryenCallIndirectGetTarget = O.To)(b);
    a._BinaryenCallIndirectSetTarget = (b, c) => (a._BinaryenCallIndirectSetTarget = O.Uo)(b, c);
    a._BinaryenCallIndirectGetTable = b => (a._BinaryenCallIndirectGetTable = O.Vo)(b);
    a._BinaryenCallIndirectSetTable = (b, c) => (a._BinaryenCallIndirectSetTable = O.Wo)(b, c);
    a._BinaryenCallIndirectGetNumOperands = b => (a._BinaryenCallIndirectGetNumOperands = O.Xo)(b);
    a._BinaryenCallIndirectGetOperandAt = (b, c) =>
      (a._BinaryenCallIndirectGetOperandAt = O.Yo)(b, c);
    a._BinaryenCallIndirectSetOperandAt = (b, c, g) =>
      (a._BinaryenCallIndirectSetOperandAt = O.Zo)(b, c, g);
    a._BinaryenCallIndirectAppendOperand = (b, c) =>
      (a._BinaryenCallIndirectAppendOperand = O._o)(b, c);
    a._BinaryenCallIndirectInsertOperandAt = (b, c, g) =>
      (a._BinaryenCallIndirectInsertOperandAt = O.$o)(b, c, g);
    a._BinaryenCallIndirectRemoveOperandAt = (b, c) =>
      (a._BinaryenCallIndirectRemoveOperandAt = O.ap)(b, c);
    a._BinaryenCallIndirectIsReturn = b => (a._BinaryenCallIndirectIsReturn = O.bp)(b);
    a._BinaryenCallIndirectSetReturn = (b, c) => (a._BinaryenCallIndirectSetReturn = O.cp)(b, c);
    a._BinaryenCallIndirectGetParams = b => (a._BinaryenCallIndirectGetParams = O.dp)(b);
    a._BinaryenCallIndirectSetParams = (b, c) => (a._BinaryenCallIndirectSetParams = O.ep)(b, c);
    a._BinaryenCallIndirectGetResults = b => (a._BinaryenCallIndirectGetResults = O.fp)(b);
    a._BinaryenCallIndirectSetResults = (b, c) => (a._BinaryenCallIndirectSetResults = O.gp)(b, c);
    a._BinaryenLocalGetGetIndex = b => (a._BinaryenLocalGetGetIndex = O.hp)(b);
    a._BinaryenLocalGetSetIndex = (b, c) => (a._BinaryenLocalGetSetIndex = O.ip)(b, c);
    a._BinaryenLocalSetIsTee = b => (a._BinaryenLocalSetIsTee = O.jp)(b);
    a._BinaryenLocalSetGetIndex = b => (a._BinaryenLocalSetGetIndex = O.kp)(b);
    a._BinaryenLocalSetSetIndex = (b, c) => (a._BinaryenLocalSetSetIndex = O.lp)(b, c);
    a._BinaryenLocalSetGetValue = b => (a._BinaryenLocalSetGetValue = O.mp)(b);
    a._BinaryenLocalSetSetValue = (b, c) => (a._BinaryenLocalSetSetValue = O.np)(b, c);
    a._BinaryenGlobalGetGetName = b => (a._BinaryenGlobalGetGetName = O.op)(b);
    a._BinaryenGlobalGetSetName = (b, c) => (a._BinaryenGlobalGetSetName = O.pp)(b, c);
    a._BinaryenGlobalSetGetName = b => (a._BinaryenGlobalSetGetName = O.qp)(b);
    a._BinaryenGlobalSetSetName = (b, c) => (a._BinaryenGlobalSetSetName = O.rp)(b, c);
    a._BinaryenGlobalSetGetValue = b => (a._BinaryenGlobalSetGetValue = O.sp)(b);
    a._BinaryenGlobalSetSetValue = (b, c) => (a._BinaryenGlobalSetSetValue = O.tp)(b, c);
    a._BinaryenTableGetGetTable = b => (a._BinaryenTableGetGetTable = O.up)(b);
    a._BinaryenTableGetSetTable = (b, c) => (a._BinaryenTableGetSetTable = O.vp)(b, c);
    a._BinaryenTableGetGetIndex = b => (a._BinaryenTableGetGetIndex = O.wp)(b);
    a._BinaryenTableGetSetIndex = (b, c) => (a._BinaryenTableGetSetIndex = O.xp)(b, c);
    a._BinaryenTableSetGetTable = b => (a._BinaryenTableSetGetTable = O.yp)(b);
    a._BinaryenTableSetSetTable = (b, c) => (a._BinaryenTableSetSetTable = O.zp)(b, c);
    a._BinaryenTableSetGetIndex = b => (a._BinaryenTableSetGetIndex = O.Ap)(b);
    a._BinaryenTableSetSetIndex = (b, c) => (a._BinaryenTableSetSetIndex = O.Bp)(b, c);
    a._BinaryenTableSetGetValue = b => (a._BinaryenTableSetGetValue = O.Cp)(b);
    a._BinaryenTableSetSetValue = (b, c) => (a._BinaryenTableSetSetValue = O.Dp)(b, c);
    a._BinaryenTableSizeGetTable = b => (a._BinaryenTableSizeGetTable = O.Ep)(b);
    a._BinaryenTableSizeSetTable = (b, c) => (a._BinaryenTableSizeSetTable = O.Fp)(b, c);
    a._BinaryenTableGrowGetTable = b => (a._BinaryenTableGrowGetTable = O.Gp)(b);
    a._BinaryenTableGrowSetTable = (b, c) => (a._BinaryenTableGrowSetTable = O.Hp)(b, c);
    a._BinaryenTableGrowGetValue = b => (a._BinaryenTableGrowGetValue = O.Ip)(b);
    a._BinaryenTableGrowSetValue = (b, c) => (a._BinaryenTableGrowSetValue = O.Jp)(b, c);
    a._BinaryenTableGrowGetDelta = b => (a._BinaryenTableGrowGetDelta = O.Kp)(b);
    a._BinaryenTableGrowSetDelta = (b, c) => (a._BinaryenTableGrowSetDelta = O.Lp)(b, c);
    a._BinaryenMemoryGrowGetDelta = b => (a._BinaryenMemoryGrowGetDelta = O.Mp)(b);
    a._BinaryenMemoryGrowSetDelta = (b, c) => (a._BinaryenMemoryGrowSetDelta = O.Np)(b, c);
    a._BinaryenLoadIsAtomic = b => (a._BinaryenLoadIsAtomic = O.Op)(b);
    a._BinaryenLoadSetAtomic = (b, c) => (a._BinaryenLoadSetAtomic = O.Pp)(b, c);
    a._BinaryenLoadIsSigned = b => (a._BinaryenLoadIsSigned = O.Qp)(b);
    a._BinaryenLoadSetSigned = (b, c) => (a._BinaryenLoadSetSigned = O.Rp)(b, c);
    a._BinaryenLoadGetBytes = b => (a._BinaryenLoadGetBytes = O.Sp)(b);
    a._BinaryenLoadSetBytes = (b, c) => (a._BinaryenLoadSetBytes = O.Tp)(b, c);
    a._BinaryenLoadGetOffset = b => (a._BinaryenLoadGetOffset = O.Up)(b);
    a._BinaryenLoadSetOffset = (b, c) => (a._BinaryenLoadSetOffset = O.Vp)(b, c);
    a._BinaryenLoadGetAlign = b => (a._BinaryenLoadGetAlign = O.Wp)(b);
    a._BinaryenLoadSetAlign = (b, c) => (a._BinaryenLoadSetAlign = O.Xp)(b, c);
    a._BinaryenLoadGetPtr = b => (a._BinaryenLoadGetPtr = O.Yp)(b);
    a._BinaryenLoadSetPtr = (b, c) => (a._BinaryenLoadSetPtr = O.Zp)(b, c);
    a._BinaryenStoreIsAtomic = b => (a._BinaryenStoreIsAtomic = O._p)(b);
    a._BinaryenStoreSetAtomic = (b, c) => (a._BinaryenStoreSetAtomic = O.$p)(b, c);
    a._BinaryenStoreGetBytes = b => (a._BinaryenStoreGetBytes = O.aq)(b);
    a._BinaryenStoreSetBytes = (b, c) => (a._BinaryenStoreSetBytes = O.bq)(b, c);
    a._BinaryenStoreGetOffset = b => (a._BinaryenStoreGetOffset = O.cq)(b);
    a._BinaryenStoreSetOffset = (b, c) => (a._BinaryenStoreSetOffset = O.dq)(b, c);
    a._BinaryenStoreGetAlign = b => (a._BinaryenStoreGetAlign = O.eq)(b);
    a._BinaryenStoreSetAlign = (b, c) => (a._BinaryenStoreSetAlign = O.fq)(b, c);
    a._BinaryenStoreGetPtr = b => (a._BinaryenStoreGetPtr = O.gq)(b);
    a._BinaryenStoreSetPtr = (b, c) => (a._BinaryenStoreSetPtr = O.hq)(b, c);
    a._BinaryenStoreGetValue = b => (a._BinaryenStoreGetValue = O.iq)(b);
    a._BinaryenStoreSetValue = (b, c) => (a._BinaryenStoreSetValue = O.jq)(b, c);
    a._BinaryenStoreGetValueType = b => (a._BinaryenStoreGetValueType = O.kq)(b);
    a._BinaryenStoreSetValueType = (b, c) => (a._BinaryenStoreSetValueType = O.lq)(b, c);
    a._BinaryenConstGetValueI32 = b => (a._BinaryenConstGetValueI32 = O.mq)(b);
    a._BinaryenConstSetValueI32 = (b, c) => (a._BinaryenConstSetValueI32 = O.nq)(b, c);
    a._BinaryenConstGetValueI64 = b => (a._BinaryenConstGetValueI64 = O.oq)(b);
    a._BinaryenConstSetValueI64 = (b, c, g) => (a._BinaryenConstSetValueI64 = O.pq)(b, c, g);
    a._BinaryenConstGetValueI64Low = b => (a._BinaryenConstGetValueI64Low = O.qq)(b);
    a._BinaryenConstSetValueI64Low = (b, c) => (a._BinaryenConstSetValueI64Low = O.rq)(b, c);
    a._BinaryenConstGetValueI64High = b => (a._BinaryenConstGetValueI64High = O.sq)(b);
    a._BinaryenConstSetValueI64High = (b, c) => (a._BinaryenConstSetValueI64High = O.tq)(b, c);
    a._BinaryenConstGetValueF32 = b => (a._BinaryenConstGetValueF32 = O.uq)(b);
    a._BinaryenConstSetValueF32 = (b, c) => (a._BinaryenConstSetValueF32 = O.vq)(b, c);
    a._BinaryenConstGetValueF64 = b => (a._BinaryenConstGetValueF64 = O.wq)(b);
    a._BinaryenConstSetValueF64 = (b, c) => (a._BinaryenConstSetValueF64 = O.xq)(b, c);
    a._BinaryenConstGetValueV128 = (b, c) => (a._BinaryenConstGetValueV128 = O.yq)(b, c);
    a._BinaryenConstSetValueV128 = (b, c) => (a._BinaryenConstSetValueV128 = O.zq)(b, c);
    a._BinaryenUnaryGetOp = b => (a._BinaryenUnaryGetOp = O.Aq)(b);
    a._BinaryenUnarySetOp = (b, c) => (a._BinaryenUnarySetOp = O.Bq)(b, c);
    a._BinaryenUnaryGetValue = b => (a._BinaryenUnaryGetValue = O.Cq)(b);
    a._BinaryenUnarySetValue = (b, c) => (a._BinaryenUnarySetValue = O.Dq)(b, c);
    a._BinaryenBinaryGetOp = b => (a._BinaryenBinaryGetOp = O.Eq)(b);
    a._BinaryenBinarySetOp = (b, c) => (a._BinaryenBinarySetOp = O.Fq)(b, c);
    a._BinaryenBinaryGetLeft = b => (a._BinaryenBinaryGetLeft = O.Gq)(b);
    a._BinaryenBinarySetLeft = (b, c) => (a._BinaryenBinarySetLeft = O.Hq)(b, c);
    a._BinaryenBinaryGetRight = b => (a._BinaryenBinaryGetRight = O.Iq)(b);
    a._BinaryenBinarySetRight = (b, c) => (a._BinaryenBinarySetRight = O.Jq)(b, c);
    a._BinaryenSelectGetIfTrue = b => (a._BinaryenSelectGetIfTrue = O.Kq)(b);
    a._BinaryenSelectSetIfTrue = (b, c) => (a._BinaryenSelectSetIfTrue = O.Lq)(b, c);
    a._BinaryenSelectGetIfFalse = b => (a._BinaryenSelectGetIfFalse = O.Mq)(b);
    a._BinaryenSelectSetIfFalse = (b, c) => (a._BinaryenSelectSetIfFalse = O.Nq)(b, c);
    a._BinaryenSelectGetCondition = b => (a._BinaryenSelectGetCondition = O.Oq)(b);
    a._BinaryenSelectSetCondition = (b, c) => (a._BinaryenSelectSetCondition = O.Pq)(b, c);
    a._BinaryenDropGetValue = b => (a._BinaryenDropGetValue = O.Qq)(b);
    a._BinaryenDropSetValue = (b, c) => (a._BinaryenDropSetValue = O.Rq)(b, c);
    a._BinaryenReturnGetValue = b => (a._BinaryenReturnGetValue = O.Sq)(b);
    a._BinaryenReturnSetValue = (b, c) => (a._BinaryenReturnSetValue = O.Tq)(b, c);
    a._BinaryenAtomicRMWGetOp = b => (a._BinaryenAtomicRMWGetOp = O.Uq)(b);
    a._BinaryenAtomicRMWSetOp = (b, c) => (a._BinaryenAtomicRMWSetOp = O.Vq)(b, c);
    a._BinaryenAtomicRMWGetBytes = b => (a._BinaryenAtomicRMWGetBytes = O.Wq)(b);
    a._BinaryenAtomicRMWSetBytes = (b, c) => (a._BinaryenAtomicRMWSetBytes = O.Xq)(b, c);
    a._BinaryenAtomicRMWGetOffset = b => (a._BinaryenAtomicRMWGetOffset = O.Yq)(b);
    a._BinaryenAtomicRMWSetOffset = (b, c) => (a._BinaryenAtomicRMWSetOffset = O.Zq)(b, c);
    a._BinaryenAtomicRMWGetPtr = b => (a._BinaryenAtomicRMWGetPtr = O._q)(b);
    a._BinaryenAtomicRMWSetPtr = (b, c) => (a._BinaryenAtomicRMWSetPtr = O.$q)(b, c);
    a._BinaryenAtomicRMWGetValue = b => (a._BinaryenAtomicRMWGetValue = O.ar)(b);
    a._BinaryenAtomicRMWSetValue = (b, c) => (a._BinaryenAtomicRMWSetValue = O.br)(b, c);
    a._BinaryenAtomicCmpxchgGetBytes = b => (a._BinaryenAtomicCmpxchgGetBytes = O.cr)(b);
    a._BinaryenAtomicCmpxchgSetBytes = (b, c) => (a._BinaryenAtomicCmpxchgSetBytes = O.dr)(b, c);
    a._BinaryenAtomicCmpxchgGetOffset = b => (a._BinaryenAtomicCmpxchgGetOffset = O.er)(b);
    a._BinaryenAtomicCmpxchgSetOffset = (b, c) => (a._BinaryenAtomicCmpxchgSetOffset = O.fr)(b, c);
    a._BinaryenAtomicCmpxchgGetPtr = b => (a._BinaryenAtomicCmpxchgGetPtr = O.gr)(b);
    a._BinaryenAtomicCmpxchgSetPtr = (b, c) => (a._BinaryenAtomicCmpxchgSetPtr = O.hr)(b, c);
    a._BinaryenAtomicCmpxchgGetExpected = b => (a._BinaryenAtomicCmpxchgGetExpected = O.ir)(b);
    a._BinaryenAtomicCmpxchgSetExpected = (b, c) =>
      (a._BinaryenAtomicCmpxchgSetExpected = O.jr)(b, c);
    a._BinaryenAtomicCmpxchgGetReplacement = b =>
      (a._BinaryenAtomicCmpxchgGetReplacement = O.kr)(b);
    a._BinaryenAtomicCmpxchgSetReplacement = (b, c) =>
      (a._BinaryenAtomicCmpxchgSetReplacement = O.lr)(b, c);
    a._BinaryenAtomicWaitGetPtr = b => (a._BinaryenAtomicWaitGetPtr = O.mr)(b);
    a._BinaryenAtomicWaitSetPtr = (b, c) => (a._BinaryenAtomicWaitSetPtr = O.nr)(b, c);
    a._BinaryenAtomicWaitGetExpected = b => (a._BinaryenAtomicWaitGetExpected = O.or)(b);
    a._BinaryenAtomicWaitSetExpected = (b, c) => (a._BinaryenAtomicWaitSetExpected = O.pr)(b, c);
    a._BinaryenAtomicWaitGetTimeout = b => (a._BinaryenAtomicWaitGetTimeout = O.qr)(b);
    a._BinaryenAtomicWaitSetTimeout = (b, c) => (a._BinaryenAtomicWaitSetTimeout = O.rr)(b, c);
    a._BinaryenAtomicWaitGetExpectedType = b => (a._BinaryenAtomicWaitGetExpectedType = O.sr)(b);
    a._BinaryenAtomicWaitSetExpectedType = (b, c) =>
      (a._BinaryenAtomicWaitSetExpectedType = O.tr)(b, c);
    a._BinaryenAtomicNotifyGetPtr = b => (a._BinaryenAtomicNotifyGetPtr = O.ur)(b);
    a._BinaryenAtomicNotifySetPtr = (b, c) => (a._BinaryenAtomicNotifySetPtr = O.vr)(b, c);
    a._BinaryenAtomicNotifyGetNotifyCount = b => (a._BinaryenAtomicNotifyGetNotifyCount = O.wr)(b);
    a._BinaryenAtomicNotifySetNotifyCount = (b, c) =>
      (a._BinaryenAtomicNotifySetNotifyCount = O.xr)(b, c);
    a._BinaryenAtomicFenceGetOrder = b => (a._BinaryenAtomicFenceGetOrder = O.yr)(b);
    a._BinaryenAtomicFenceSetOrder = (b, c) => (a._BinaryenAtomicFenceSetOrder = O.zr)(b, c);
    a._BinaryenSIMDExtractGetOp = b => (a._BinaryenSIMDExtractGetOp = O.Ar)(b);
    a._BinaryenSIMDExtractSetOp = (b, c) => (a._BinaryenSIMDExtractSetOp = O.Br)(b, c);
    a._BinaryenSIMDExtractGetVec = b => (a._BinaryenSIMDExtractGetVec = O.Cr)(b);
    a._BinaryenSIMDExtractSetVec = (b, c) => (a._BinaryenSIMDExtractSetVec = O.Dr)(b, c);
    a._BinaryenSIMDExtractGetIndex = b => (a._BinaryenSIMDExtractGetIndex = O.Er)(b);
    a._BinaryenSIMDExtractSetIndex = (b, c) => (a._BinaryenSIMDExtractSetIndex = O.Fr)(b, c);
    a._BinaryenSIMDReplaceGetOp = b => (a._BinaryenSIMDReplaceGetOp = O.Gr)(b);
    a._BinaryenSIMDReplaceSetOp = (b, c) => (a._BinaryenSIMDReplaceSetOp = O.Hr)(b, c);
    a._BinaryenSIMDReplaceGetVec = b => (a._BinaryenSIMDReplaceGetVec = O.Ir)(b);
    a._BinaryenSIMDReplaceSetVec = (b, c) => (a._BinaryenSIMDReplaceSetVec = O.Jr)(b, c);
    a._BinaryenSIMDReplaceGetIndex = b => (a._BinaryenSIMDReplaceGetIndex = O.Kr)(b);
    a._BinaryenSIMDReplaceSetIndex = (b, c) => (a._BinaryenSIMDReplaceSetIndex = O.Lr)(b, c);
    a._BinaryenSIMDReplaceGetValue = b => (a._BinaryenSIMDReplaceGetValue = O.Mr)(b);
    a._BinaryenSIMDReplaceSetValue = (b, c) => (a._BinaryenSIMDReplaceSetValue = O.Nr)(b, c);
    a._BinaryenSIMDShuffleGetLeft = b => (a._BinaryenSIMDShuffleGetLeft = O.Or)(b);
    a._BinaryenSIMDShuffleSetLeft = (b, c) => (a._BinaryenSIMDShuffleSetLeft = O.Pr)(b, c);
    a._BinaryenSIMDShuffleGetRight = b => (a._BinaryenSIMDShuffleGetRight = O.Qr)(b);
    a._BinaryenSIMDShuffleSetRight = (b, c) => (a._BinaryenSIMDShuffleSetRight = O.Rr)(b, c);
    a._BinaryenSIMDShuffleGetMask = (b, c) => (a._BinaryenSIMDShuffleGetMask = O.Sr)(b, c);
    a._BinaryenSIMDShuffleSetMask = (b, c) => (a._BinaryenSIMDShuffleSetMask = O.Tr)(b, c);
    a._BinaryenSIMDTernaryGetOp = b => (a._BinaryenSIMDTernaryGetOp = O.Ur)(b);
    a._BinaryenSIMDTernarySetOp = (b, c) => (a._BinaryenSIMDTernarySetOp = O.Vr)(b, c);
    a._BinaryenSIMDTernaryGetA = b => (a._BinaryenSIMDTernaryGetA = O.Wr)(b);
    a._BinaryenSIMDTernarySetA = (b, c) => (a._BinaryenSIMDTernarySetA = O.Xr)(b, c);
    a._BinaryenSIMDTernaryGetB = b => (a._BinaryenSIMDTernaryGetB = O.Yr)(b);
    a._BinaryenSIMDTernarySetB = (b, c) => (a._BinaryenSIMDTernarySetB = O.Zr)(b, c);
    a._BinaryenSIMDTernaryGetC = b => (a._BinaryenSIMDTernaryGetC = O._r)(b);
    a._BinaryenSIMDTernarySetC = (b, c) => (a._BinaryenSIMDTernarySetC = O.$r)(b, c);
    a._BinaryenSIMDShiftGetOp = b => (a._BinaryenSIMDShiftGetOp = O.as)(b);
    a._BinaryenSIMDShiftSetOp = (b, c) => (a._BinaryenSIMDShiftSetOp = O.bs)(b, c);
    a._BinaryenSIMDShiftGetVec = b => (a._BinaryenSIMDShiftGetVec = O.cs)(b);
    a._BinaryenSIMDShiftSetVec = (b, c) => (a._BinaryenSIMDShiftSetVec = O.ds)(b, c);
    a._BinaryenSIMDShiftGetShift = b => (a._BinaryenSIMDShiftGetShift = O.es)(b);
    a._BinaryenSIMDShiftSetShift = (b, c) => (a._BinaryenSIMDShiftSetShift = O.fs)(b, c);
    a._BinaryenSIMDLoadGetOp = b => (a._BinaryenSIMDLoadGetOp = O.gs)(b);
    a._BinaryenSIMDLoadSetOp = (b, c) => (a._BinaryenSIMDLoadSetOp = O.hs)(b, c);
    a._BinaryenSIMDLoadGetOffset = b => (a._BinaryenSIMDLoadGetOffset = O.is)(b);
    a._BinaryenSIMDLoadSetOffset = (b, c) => (a._BinaryenSIMDLoadSetOffset = O.js)(b, c);
    a._BinaryenSIMDLoadGetAlign = b => (a._BinaryenSIMDLoadGetAlign = O.ks)(b);
    a._BinaryenSIMDLoadSetAlign = (b, c) => (a._BinaryenSIMDLoadSetAlign = O.ls)(b, c);
    a._BinaryenSIMDLoadGetPtr = b => (a._BinaryenSIMDLoadGetPtr = O.ms)(b);
    a._BinaryenSIMDLoadSetPtr = (b, c) => (a._BinaryenSIMDLoadSetPtr = O.ns)(b, c);
    a._BinaryenSIMDLoadStoreLaneGetOp = b => (a._BinaryenSIMDLoadStoreLaneGetOp = O.os)(b);
    a._BinaryenSIMDLoadStoreLaneSetOp = (b, c) => (a._BinaryenSIMDLoadStoreLaneSetOp = O.ps)(b, c);
    a._BinaryenSIMDLoadStoreLaneGetOffset = b => (a._BinaryenSIMDLoadStoreLaneGetOffset = O.qs)(b);
    a._BinaryenSIMDLoadStoreLaneSetOffset = (b, c) =>
      (a._BinaryenSIMDLoadStoreLaneSetOffset = O.rs)(b, c);
    a._BinaryenSIMDLoadStoreLaneGetAlign = b => (a._BinaryenSIMDLoadStoreLaneGetAlign = O.ss)(b);
    a._BinaryenSIMDLoadStoreLaneSetAlign = (b, c) =>
      (a._BinaryenSIMDLoadStoreLaneSetAlign = O.ts)(b, c);
    a._BinaryenSIMDLoadStoreLaneGetIndex = b => (a._BinaryenSIMDLoadStoreLaneGetIndex = O.us)(b);
    a._BinaryenSIMDLoadStoreLaneSetIndex = (b, c) =>
      (a._BinaryenSIMDLoadStoreLaneSetIndex = O.vs)(b, c);
    a._BinaryenSIMDLoadStoreLaneGetPtr = b => (a._BinaryenSIMDLoadStoreLaneGetPtr = O.ws)(b);
    a._BinaryenSIMDLoadStoreLaneSetPtr = (b, c) =>
      (a._BinaryenSIMDLoadStoreLaneSetPtr = O.xs)(b, c);
    a._BinaryenSIMDLoadStoreLaneGetVec = b => (a._BinaryenSIMDLoadStoreLaneGetVec = O.ys)(b);
    a._BinaryenSIMDLoadStoreLaneSetVec = (b, c) =>
      (a._BinaryenSIMDLoadStoreLaneSetVec = O.zs)(b, c);
    a._BinaryenSIMDLoadStoreLaneIsStore = b => (a._BinaryenSIMDLoadStoreLaneIsStore = O.As)(b);
    a._BinaryenMemoryInitGetSegment = b => (a._BinaryenMemoryInitGetSegment = O.Bs)(b);
    a._BinaryenMemoryInitSetSegment = (b, c) => (a._BinaryenMemoryInitSetSegment = O.Cs)(b, c);
    a._BinaryenMemoryInitGetDest = b => (a._BinaryenMemoryInitGetDest = O.Ds)(b);
    a._BinaryenMemoryInitSetDest = (b, c) => (a._BinaryenMemoryInitSetDest = O.Es)(b, c);
    a._BinaryenMemoryInitGetOffset = b => (a._BinaryenMemoryInitGetOffset = O.Fs)(b);
    a._BinaryenMemoryInitSetOffset = (b, c) => (a._BinaryenMemoryInitSetOffset = O.Gs)(b, c);
    a._BinaryenMemoryInitGetSize = b => (a._BinaryenMemoryInitGetSize = O.Hs)(b);
    a._BinaryenMemoryInitSetSize = (b, c) => (a._BinaryenMemoryInitSetSize = O.Is)(b, c);
    a._BinaryenDataDropGetSegment = b => (a._BinaryenDataDropGetSegment = O.Js)(b);
    a._BinaryenDataDropSetSegment = (b, c) => (a._BinaryenDataDropSetSegment = O.Ks)(b, c);
    a._BinaryenMemoryCopyGetDest = b => (a._BinaryenMemoryCopyGetDest = O.Ls)(b);
    a._BinaryenMemoryCopySetDest = (b, c) => (a._BinaryenMemoryCopySetDest = O.Ms)(b, c);
    a._BinaryenMemoryCopyGetSource = b => (a._BinaryenMemoryCopyGetSource = O.Ns)(b);
    a._BinaryenMemoryCopySetSource = (b, c) => (a._BinaryenMemoryCopySetSource = O.Os)(b, c);
    a._BinaryenMemoryCopyGetSize = b => (a._BinaryenMemoryCopyGetSize = O.Ps)(b);
    a._BinaryenMemoryCopySetSize = (b, c) => (a._BinaryenMemoryCopySetSize = O.Qs)(b, c);
    a._BinaryenMemoryFillGetDest = b => (a._BinaryenMemoryFillGetDest = O.Rs)(b);
    a._BinaryenMemoryFillSetDest = (b, c) => (a._BinaryenMemoryFillSetDest = O.Ss)(b, c);
    a._BinaryenMemoryFillGetValue = b => (a._BinaryenMemoryFillGetValue = O.Ts)(b);
    a._BinaryenMemoryFillSetValue = (b, c) => (a._BinaryenMemoryFillSetValue = O.Us)(b, c);
    a._BinaryenMemoryFillGetSize = b => (a._BinaryenMemoryFillGetSize = O.Vs)(b);
    a._BinaryenMemoryFillSetSize = (b, c) => (a._BinaryenMemoryFillSetSize = O.Ws)(b, c);
    a._BinaryenRefIsNullGetValue = b => (a._BinaryenRefIsNullGetValue = O.Xs)(b);
    a._BinaryenRefIsNullSetValue = (b, c) => (a._BinaryenRefIsNullSetValue = O.Ys)(b, c);
    a._BinaryenRefAsGetOp = b => (a._BinaryenRefAsGetOp = O.Zs)(b);
    a._BinaryenRefAsSetOp = (b, c) => (a._BinaryenRefAsSetOp = O._s)(b, c);
    a._BinaryenRefAsGetValue = b => (a._BinaryenRefAsGetValue = O.$s)(b);
    a._BinaryenRefAsSetValue = (b, c) => (a._BinaryenRefAsSetValue = O.at)(b, c);
    a._BinaryenRefFuncGetFunc = b => (a._BinaryenRefFuncGetFunc = O.bt)(b);
    a._BinaryenRefFuncSetFunc = (b, c) => (a._BinaryenRefFuncSetFunc = O.ct)(b, c);
    a._BinaryenRefEqGetLeft = b => (a._BinaryenRefEqGetLeft = O.dt)(b);
    a._BinaryenRefEqSetLeft = (b, c) => (a._BinaryenRefEqSetLeft = O.et)(b, c);
    a._BinaryenRefEqGetRight = b => (a._BinaryenRefEqGetRight = O.ft)(b);
    a._BinaryenRefEqSetRight = (b, c) => (a._BinaryenRefEqSetRight = O.gt)(b, c);
    a._BinaryenTryGetName = b => (a._BinaryenTryGetName = O.ht)(b);
    a._BinaryenTrySetName = (b, c) => (a._BinaryenTrySetName = O.it)(b, c);
    a._BinaryenTryGetBody = b => (a._BinaryenTryGetBody = O.jt)(b);
    a._BinaryenTrySetBody = (b, c) => (a._BinaryenTrySetBody = O.kt)(b, c);
    a._BinaryenTryGetNumCatchTags = b => (a._BinaryenTryGetNumCatchTags = O.lt)(b);
    a._BinaryenTryGetNumCatchBodies = b => (a._BinaryenTryGetNumCatchBodies = O.mt)(b);
    a._BinaryenTryGetCatchTagAt = (b, c) => (a._BinaryenTryGetCatchTagAt = O.nt)(b, c);
    a._BinaryenTrySetCatchTagAt = (b, c, g) => (a._BinaryenTrySetCatchTagAt = O.ot)(b, c, g);
    a._BinaryenTryAppendCatchTag = (b, c) => (a._BinaryenTryAppendCatchTag = O.pt)(b, c);
    a._BinaryenTryInsertCatchTagAt = (b, c, g) => (a._BinaryenTryInsertCatchTagAt = O.qt)(b, c, g);
    a._BinaryenTryRemoveCatchTagAt = (b, c) => (a._BinaryenTryRemoveCatchTagAt = O.rt)(b, c);
    a._BinaryenTryGetCatchBodyAt = (b, c) => (a._BinaryenTryGetCatchBodyAt = O.st)(b, c);
    a._BinaryenTrySetCatchBodyAt = (b, c, g) => (a._BinaryenTrySetCatchBodyAt = O.tt)(b, c, g);
    a._BinaryenTryAppendCatchBody = (b, c) => (a._BinaryenTryAppendCatchBody = O.ut)(b, c);
    a._BinaryenTryInsertCatchBodyAt = (b, c, g) =>
      (a._BinaryenTryInsertCatchBodyAt = O.vt)(b, c, g);
    a._BinaryenTryRemoveCatchBodyAt = (b, c) => (a._BinaryenTryRemoveCatchBodyAt = O.wt)(b, c);
    a._BinaryenTryHasCatchAll = b => (a._BinaryenTryHasCatchAll = O.xt)(b);
    a._BinaryenTryGetDelegateTarget = b => (a._BinaryenTryGetDelegateTarget = O.yt)(b);
    a._BinaryenTrySetDelegateTarget = (b, c) => (a._BinaryenTrySetDelegateTarget = O.zt)(b, c);
    a._BinaryenTryIsDelegate = b => (a._BinaryenTryIsDelegate = O.At)(b);
    a._BinaryenThrowGetTag = b => (a._BinaryenThrowGetTag = O.Bt)(b);
    a._BinaryenThrowSetTag = (b, c) => (a._BinaryenThrowSetTag = O.Ct)(b, c);
    a._BinaryenThrowGetNumOperands = b => (a._BinaryenThrowGetNumOperands = O.Dt)(b);
    a._BinaryenThrowGetOperandAt = (b, c) => (a._BinaryenThrowGetOperandAt = O.Et)(b, c);
    a._BinaryenThrowSetOperandAt = (b, c, g) => (a._BinaryenThrowSetOperandAt = O.Ft)(b, c, g);
    a._BinaryenThrowAppendOperand = (b, c) => (a._BinaryenThrowAppendOperand = O.Gt)(b, c);
    a._BinaryenThrowInsertOperandAt = (b, c, g) =>
      (a._BinaryenThrowInsertOperandAt = O.Ht)(b, c, g);
    a._BinaryenThrowRemoveOperandAt = (b, c) => (a._BinaryenThrowRemoveOperandAt = O.It)(b, c);
    a._BinaryenRethrowGetTarget = b => (a._BinaryenRethrowGetTarget = O.Jt)(b);
    a._BinaryenRethrowSetTarget = (b, c) => (a._BinaryenRethrowSetTarget = O.Kt)(b, c);
    a._BinaryenTupleMakeGetNumOperands = b => (a._BinaryenTupleMakeGetNumOperands = O.Lt)(b);
    a._BinaryenTupleMakeGetOperandAt = (b, c) => (a._BinaryenTupleMakeGetOperandAt = O.Mt)(b, c);
    a._BinaryenTupleMakeSetOperandAt = (b, c, g) =>
      (a._BinaryenTupleMakeSetOperandAt = O.Nt)(b, c, g);
    a._BinaryenTupleMakeAppendOperand = (b, c) => (a._BinaryenTupleMakeAppendOperand = O.Ot)(b, c);
    a._BinaryenTupleMakeInsertOperandAt = (b, c, g) =>
      (a._BinaryenTupleMakeInsertOperandAt = O.Pt)(b, c, g);
    a._BinaryenTupleMakeRemoveOperandAt = (b, c) =>
      (a._BinaryenTupleMakeRemoveOperandAt = O.Qt)(b, c);
    a._BinaryenTupleExtractGetTuple = b => (a._BinaryenTupleExtractGetTuple = O.Rt)(b);
    a._BinaryenTupleExtractSetTuple = (b, c) => (a._BinaryenTupleExtractSetTuple = O.St)(b, c);
    a._BinaryenTupleExtractGetIndex = b => (a._BinaryenTupleExtractGetIndex = O.Tt)(b);
    a._BinaryenTupleExtractSetIndex = (b, c) => (a._BinaryenTupleExtractSetIndex = O.Ut)(b, c);
    a._BinaryenRefI31GetValue = b => (a._BinaryenRefI31GetValue = O.Vt)(b);
    a._BinaryenRefI31SetValue = (b, c) => (a._BinaryenRefI31SetValue = O.Wt)(b, c);
    a._BinaryenI31GetGetI31 = b => (a._BinaryenI31GetGetI31 = O.Xt)(b);
    a._BinaryenI31GetSetI31 = (b, c) => (a._BinaryenI31GetSetI31 = O.Yt)(b, c);
    a._BinaryenI31GetIsSigned = b => (a._BinaryenI31GetIsSigned = O.Zt)(b);
    a._BinaryenI31GetSetSigned = (b, c) => (a._BinaryenI31GetSetSigned = O._t)(b, c);
    a._BinaryenCallRefGetNumOperands = b => (a._BinaryenCallRefGetNumOperands = O.$t)(b);
    a._BinaryenCallRefGetOperandAt = (b, c) => (a._BinaryenCallRefGetOperandAt = O.au)(b, c);
    a._BinaryenCallRefSetOperandAt = (b, c, g) => (a._BinaryenCallRefSetOperandAt = O.bu)(b, c, g);
    a._BinaryenCallRefAppendOperand = (b, c) => (a._BinaryenCallRefAppendOperand = O.cu)(b, c);
    a._BinaryenCallRefInsertOperandAt = (b, c, g) =>
      (a._BinaryenCallRefInsertOperandAt = O.du)(b, c, g);
    a._BinaryenCallRefRemoveOperandAt = (b, c) => (a._BinaryenCallRefRemoveOperandAt = O.eu)(b, c);
    a._BinaryenCallRefGetTarget = b => (a._BinaryenCallRefGetTarget = O.fu)(b);
    a._BinaryenCallRefSetTarget = (b, c) => (a._BinaryenCallRefSetTarget = O.gu)(b, c);
    a._BinaryenCallRefIsReturn = b => (a._BinaryenCallRefIsReturn = O.hu)(b);
    a._BinaryenCallRefSetReturn = (b, c) => (a._BinaryenCallRefSetReturn = O.iu)(b, c);
    a._BinaryenRefTestGetRef = b => (a._BinaryenRefTestGetRef = O.ju)(b);
    a._BinaryenRefTestSetRef = (b, c) => (a._BinaryenRefTestSetRef = O.ku)(b, c);
    a._BinaryenRefTestGetCastType = b => (a._BinaryenRefTestGetCastType = O.lu)(b);
    a._BinaryenRefTestSetCastType = (b, c) => (a._BinaryenRefTestSetCastType = O.mu)(b, c);
    a._BinaryenRefCastGetRef = b => (a._BinaryenRefCastGetRef = O.nu)(b);
    a._BinaryenRefCastSetRef = (b, c) => (a._BinaryenRefCastSetRef = O.ou)(b, c);
    a._BinaryenBrOnGetOp = b => (a._BinaryenBrOnGetOp = O.pu)(b);
    a._BinaryenBrOnSetOp = (b, c) => (a._BinaryenBrOnSetOp = O.qu)(b, c);
    a._BinaryenBrOnGetName = b => (a._BinaryenBrOnGetName = O.ru)(b);
    a._BinaryenBrOnSetName = (b, c) => (a._BinaryenBrOnSetName = O.su)(b, c);
    a._BinaryenBrOnGetRef = b => (a._BinaryenBrOnGetRef = O.tu)(b);
    a._BinaryenBrOnSetRef = (b, c) => (a._BinaryenBrOnSetRef = O.uu)(b, c);
    a._BinaryenBrOnGetCastType = b => (a._BinaryenBrOnGetCastType = O.vu)(b);
    a._BinaryenBrOnSetCastType = (b, c) => (a._BinaryenBrOnSetCastType = O.wu)(b, c);
    a._BinaryenStructNewGetNumOperands = b => (a._BinaryenStructNewGetNumOperands = O.xu)(b);
    a._BinaryenStructNewGetOperandAt = (b, c) => (a._BinaryenStructNewGetOperandAt = O.yu)(b, c);
    a._BinaryenStructNewSetOperandAt = (b, c, g) =>
      (a._BinaryenStructNewSetOperandAt = O.zu)(b, c, g);
    a._BinaryenStructNewAppendOperand = (b, c) => (a._BinaryenStructNewAppendOperand = O.Au)(b, c);
    a._BinaryenStructNewInsertOperandAt = (b, c, g) =>
      (a._BinaryenStructNewInsertOperandAt = O.Bu)(b, c, g);
    a._BinaryenStructNewRemoveOperandAt = (b, c) =>
      (a._BinaryenStructNewRemoveOperandAt = O.Cu)(b, c);
    a._BinaryenStructGetGetIndex = b => (a._BinaryenStructGetGetIndex = O.Du)(b);
    a._BinaryenStructGetSetIndex = (b, c) => (a._BinaryenStructGetSetIndex = O.Eu)(b, c);
    a._BinaryenStructGetGetRef = b => (a._BinaryenStructGetGetRef = O.Fu)(b);
    a._BinaryenStructGetSetRef = (b, c) => (a._BinaryenStructGetSetRef = O.Gu)(b, c);
    a._BinaryenStructGetIsSigned = b => (a._BinaryenStructGetIsSigned = O.Hu)(b);
    a._BinaryenStructGetSetSigned = (b, c) => (a._BinaryenStructGetSetSigned = O.Iu)(b, c);
    a._BinaryenStructSetGetIndex = b => (a._BinaryenStructSetGetIndex = O.Ju)(b);
    a._BinaryenStructSetSetIndex = (b, c) => (a._BinaryenStructSetSetIndex = O.Ku)(b, c);
    a._BinaryenStructSetGetRef = b => (a._BinaryenStructSetGetRef = O.Lu)(b);
    a._BinaryenStructSetSetRef = (b, c) => (a._BinaryenStructSetSetRef = O.Mu)(b, c);
    a._BinaryenStructSetGetValue = b => (a._BinaryenStructSetGetValue = O.Nu)(b);
    a._BinaryenStructSetSetValue = (b, c) => (a._BinaryenStructSetSetValue = O.Ou)(b, c);
    a._BinaryenArrayNewGetInit = b => (a._BinaryenArrayNewGetInit = O.Pu)(b);
    a._BinaryenArrayNewSetInit = (b, c) => (a._BinaryenArrayNewSetInit = O.Qu)(b, c);
    a._BinaryenArrayNewGetSize = b => (a._BinaryenArrayNewGetSize = O.Ru)(b);
    a._BinaryenArrayNewSetSize = (b, c) => (a._BinaryenArrayNewSetSize = O.Su)(b, c);
    a._BinaryenArrayNewFixedGetNumValues = b => (a._BinaryenArrayNewFixedGetNumValues = O.Tu)(b);
    a._BinaryenArrayNewFixedGetValueAt = (b, c) =>
      (a._BinaryenArrayNewFixedGetValueAt = O.Uu)(b, c);
    a._BinaryenArrayNewFixedSetValueAt = (b, c, g) =>
      (a._BinaryenArrayNewFixedSetValueAt = O.Vu)(b, c, g);
    a._BinaryenArrayNewFixedAppendValue = (b, c) =>
      (a._BinaryenArrayNewFixedAppendValue = O.Wu)(b, c);
    a._BinaryenArrayNewFixedInsertValueAt = (b, c, g) =>
      (a._BinaryenArrayNewFixedInsertValueAt = O.Xu)(b, c, g);
    a._BinaryenArrayNewFixedRemoveValueAt = (b, c) =>
      (a._BinaryenArrayNewFixedRemoveValueAt = O.Yu)(b, c);
    a._BinaryenArrayNewDataGetSegment = b => (a._BinaryenArrayNewDataGetSegment = O.Zu)(b);
    a._BinaryenArrayNewDataSetSegment = (b, c) => (a._BinaryenArrayNewDataSetSegment = O._u)(b, c);
    a._BinaryenArrayNewDataGetOffset = b => (a._BinaryenArrayNewDataGetOffset = O.$u)(b);
    a._BinaryenArrayNewDataSetOffset = (b, c) => (a._BinaryenArrayNewDataSetOffset = O.av)(b, c);
    a._BinaryenArrayNewDataGetSize = b => (a._BinaryenArrayNewDataGetSize = O.bv)(b);
    a._BinaryenArrayNewDataSetSize = (b, c) => (a._BinaryenArrayNewDataSetSize = O.cv)(b, c);
    a._BinaryenArrayNewElemGetSegment = b => (a._BinaryenArrayNewElemGetSegment = O.dv)(b);
    a._BinaryenArrayNewElemSetSegment = (b, c) => (a._BinaryenArrayNewElemSetSegment = O.ev)(b, c);
    a._BinaryenArrayNewElemGetOffset = b => (a._BinaryenArrayNewElemGetOffset = O.fv)(b);
    a._BinaryenArrayNewElemSetOffset = (b, c) => (a._BinaryenArrayNewElemSetOffset = O.gv)(b, c);
    a._BinaryenArrayNewElemGetSize = b => (a._BinaryenArrayNewElemGetSize = O.hv)(b);
    a._BinaryenArrayNewElemSetSize = (b, c) => (a._BinaryenArrayNewElemSetSize = O.iv)(b, c);
    a._BinaryenArrayGetGetRef = b => (a._BinaryenArrayGetGetRef = O.jv)(b);
    a._BinaryenArrayGetSetRef = (b, c) => (a._BinaryenArrayGetSetRef = O.kv)(b, c);
    a._BinaryenArrayGetGetIndex = b => (a._BinaryenArrayGetGetIndex = O.lv)(b);
    a._BinaryenArrayGetSetIndex = (b, c) => (a._BinaryenArrayGetSetIndex = O.mv)(b, c);
    a._BinaryenArrayGetIsSigned = b => (a._BinaryenArrayGetIsSigned = O.nv)(b);
    a._BinaryenArrayGetSetSigned = (b, c) => (a._BinaryenArrayGetSetSigned = O.ov)(b, c);
    a._BinaryenArraySetGetRef = b => (a._BinaryenArraySetGetRef = O.pv)(b);
    a._BinaryenArraySetSetRef = (b, c) => (a._BinaryenArraySetSetRef = O.qv)(b, c);
    a._BinaryenArraySetGetIndex = b => (a._BinaryenArraySetGetIndex = O.rv)(b);
    a._BinaryenArraySetSetIndex = (b, c) => (a._BinaryenArraySetSetIndex = O.sv)(b, c);
    a._BinaryenArraySetGetValue = b => (a._BinaryenArraySetGetValue = O.tv)(b);
    a._BinaryenArraySetSetValue = (b, c) => (a._BinaryenArraySetSetValue = O.uv)(b, c);
    a._BinaryenArrayLenGetRef = b => (a._BinaryenArrayLenGetRef = O.vv)(b);
    a._BinaryenArrayLenSetRef = (b, c) => (a._BinaryenArrayLenSetRef = O.wv)(b, c);
    a._BinaryenArrayFillGetRef = b => (a._BinaryenArrayFillGetRef = O.xv)(b);
    a._BinaryenArrayFillSetRef = (b, c) => (a._BinaryenArrayFillSetRef = O.yv)(b, c);
    a._BinaryenArrayFillGetIndex = b => (a._BinaryenArrayFillGetIndex = O.zv)(b);
    a._BinaryenArrayFillSetIndex = (b, c) => (a._BinaryenArrayFillSetIndex = O.Av)(b, c);
    a._BinaryenArrayFillGetValue = b => (a._BinaryenArrayFillGetValue = O.Bv)(b);
    a._BinaryenArrayFillSetValue = (b, c) => (a._BinaryenArrayFillSetValue = O.Cv)(b, c);
    a._BinaryenArrayFillGetSize = b => (a._BinaryenArrayFillGetSize = O.Dv)(b);
    a._BinaryenArrayFillSetSize = (b, c) => (a._BinaryenArrayFillSetSize = O.Ev)(b, c);
    a._BinaryenArrayCopyGetDestRef = b => (a._BinaryenArrayCopyGetDestRef = O.Fv)(b);
    a._BinaryenArrayCopySetDestRef = (b, c) => (a._BinaryenArrayCopySetDestRef = O.Gv)(b, c);
    a._BinaryenArrayCopyGetDestIndex = b => (a._BinaryenArrayCopyGetDestIndex = O.Hv)(b);
    a._BinaryenArrayCopySetDestIndex = (b, c) => (a._BinaryenArrayCopySetDestIndex = O.Iv)(b, c);
    a._BinaryenArrayCopyGetSrcRef = b => (a._BinaryenArrayCopyGetSrcRef = O.Jv)(b);
    a._BinaryenArrayCopySetSrcRef = (b, c) => (a._BinaryenArrayCopySetSrcRef = O.Kv)(b, c);
    a._BinaryenArrayCopyGetSrcIndex = b => (a._BinaryenArrayCopyGetSrcIndex = O.Lv)(b);
    a._BinaryenArrayCopySetSrcIndex = (b, c) => (a._BinaryenArrayCopySetSrcIndex = O.Mv)(b, c);
    a._BinaryenArrayCopyGetLength = b => (a._BinaryenArrayCopyGetLength = O.Nv)(b);
    a._BinaryenArrayCopySetLength = (b, c) => (a._BinaryenArrayCopySetLength = O.Ov)(b, c);
    a._BinaryenArrayInitDataGetSegment = b => (a._BinaryenArrayInitDataGetSegment = O.Pv)(b);
    a._BinaryenArrayInitDataSetSegment = (b, c) =>
      (a._BinaryenArrayInitDataSetSegment = O.Qv)(b, c);
    a._BinaryenArrayInitDataGetRef = b => (a._BinaryenArrayInitDataGetRef = O.Rv)(b);
    a._BinaryenArrayInitDataSetRef = (b, c) => (a._BinaryenArrayInitDataSetRef = O.Sv)(b, c);
    a._BinaryenArrayInitDataGetIndex = b => (a._BinaryenArrayInitDataGetIndex = O.Tv)(b);
    a._BinaryenArrayInitDataSetIndex = (b, c) => (a._BinaryenArrayInitDataSetIndex = O.Uv)(b, c);
    a._BinaryenArrayInitDataGetOffset = b => (a._BinaryenArrayInitDataGetOffset = O.Vv)(b);
    a._BinaryenArrayInitDataSetOffset = (b, c) => (a._BinaryenArrayInitDataSetOffset = O.Wv)(b, c);
    a._BinaryenArrayInitDataGetSize = b => (a._BinaryenArrayInitDataGetSize = O.Xv)(b);
    a._BinaryenArrayInitDataSetSize = (b, c) => (a._BinaryenArrayInitDataSetSize = O.Yv)(b, c);
    a._BinaryenArrayInitElemGetSegment = b => (a._BinaryenArrayInitElemGetSegment = O.Zv)(b);
    a._BinaryenArrayInitElemSetSegment = (b, c) =>
      (a._BinaryenArrayInitElemSetSegment = O._v)(b, c);
    a._BinaryenArrayInitElemGetRef = b => (a._BinaryenArrayInitElemGetRef = O.$v)(b);
    a._BinaryenArrayInitElemSetRef = (b, c) => (a._BinaryenArrayInitElemSetRef = O.aw)(b, c);
    a._BinaryenArrayInitElemGetIndex = b => (a._BinaryenArrayInitElemGetIndex = O.bw)(b);
    a._BinaryenArrayInitElemSetIndex = (b, c) => (a._BinaryenArrayInitElemSetIndex = O.cw)(b, c);
    a._BinaryenArrayInitElemGetOffset = b => (a._BinaryenArrayInitElemGetOffset = O.dw)(b);
    a._BinaryenArrayInitElemSetOffset = (b, c) => (a._BinaryenArrayInitElemSetOffset = O.ew)(b, c);
    a._BinaryenArrayInitElemGetSize = b => (a._BinaryenArrayInitElemGetSize = O.fw)(b);
    a._BinaryenArrayInitElemSetSize = (b, c) => (a._BinaryenArrayInitElemSetSize = O.gw)(b, c);
    a._BinaryenStringNewGetOp = b => (a._BinaryenStringNewGetOp = O.hw)(b);
    a._BinaryenStringNewSetOp = (b, c) => (a._BinaryenStringNewSetOp = O.iw)(b, c);
    a._BinaryenStringNewGetRef = b => (a._BinaryenStringNewGetRef = O.jw)(b);
    a._BinaryenStringNewSetRef = (b, c) => (a._BinaryenStringNewSetRef = O.kw)(b, c);
    a._BinaryenStringNewGetStart = b => (a._BinaryenStringNewGetStart = O.lw)(b);
    a._BinaryenStringNewSetStart = (b, c) => (a._BinaryenStringNewSetStart = O.mw)(b, c);
    a._BinaryenStringNewGetEnd = b => (a._BinaryenStringNewGetEnd = O.nw)(b);
    a._BinaryenStringNewSetEnd = (b, c) => (a._BinaryenStringNewSetEnd = O.ow)(b, c);
    a._BinaryenStringConstGetString = b => (a._BinaryenStringConstGetString = O.pw)(b);
    a._BinaryenStringConstSetString = (b, c) => (a._BinaryenStringConstSetString = O.qw)(b, c);
    a._BinaryenStringMeasureGetOp = b => (a._BinaryenStringMeasureGetOp = O.rw)(b);
    a._BinaryenStringMeasureSetOp = (b, c) => (a._BinaryenStringMeasureSetOp = O.sw)(b, c);
    a._BinaryenStringMeasureGetRef = b => (a._BinaryenStringMeasureGetRef = O.tw)(b);
    a._BinaryenStringMeasureSetRef = (b, c) => (a._BinaryenStringMeasureSetRef = O.uw)(b, c);
    a._BinaryenStringEncodeGetOp = b => (a._BinaryenStringEncodeGetOp = O.vw)(b);
    a._BinaryenStringEncodeSetOp = (b, c) => (a._BinaryenStringEncodeSetOp = O.ww)(b, c);
    a._BinaryenStringEncodeGetStr = b => (a._BinaryenStringEncodeGetStr = O.xw)(b);
    a._BinaryenStringEncodeSetStr = (b, c) => (a._BinaryenStringEncodeSetStr = O.yw)(b, c);
    a._BinaryenStringEncodeGetArray = b => (a._BinaryenStringEncodeGetArray = O.zw)(b);
    a._BinaryenStringEncodeSetArray = (b, c) => (a._BinaryenStringEncodeSetArray = O.Aw)(b, c);
    a._BinaryenStringEncodeGetStart = b => (a._BinaryenStringEncodeGetStart = O.Bw)(b);
    a._BinaryenStringEncodeSetStart = (b, c) => (a._BinaryenStringEncodeSetStart = O.Cw)(b, c);
    a._BinaryenStringConcatGetLeft = b => (a._BinaryenStringConcatGetLeft = O.Dw)(b);
    a._BinaryenStringConcatSetLeft = (b, c) => (a._BinaryenStringConcatSetLeft = O.Ew)(b, c);
    a._BinaryenStringConcatGetRight = b => (a._BinaryenStringConcatGetRight = O.Fw)(b);
    a._BinaryenStringConcatSetRight = (b, c) => (a._BinaryenStringConcatSetRight = O.Gw)(b, c);
    a._BinaryenStringEqGetOp = b => (a._BinaryenStringEqGetOp = O.Hw)(b);
    a._BinaryenStringEqSetOp = (b, c) => (a._BinaryenStringEqSetOp = O.Iw)(b, c);
    a._BinaryenStringEqGetLeft = b => (a._BinaryenStringEqGetLeft = O.Jw)(b);
    a._BinaryenStringEqSetLeft = (b, c) => (a._BinaryenStringEqSetLeft = O.Kw)(b, c);
    a._BinaryenStringEqGetRight = b => (a._BinaryenStringEqGetRight = O.Lw)(b);
    a._BinaryenStringEqSetRight = (b, c) => (a._BinaryenStringEqSetRight = O.Mw)(b, c);
    a._BinaryenStringWTF16GetGetRef = b => (a._BinaryenStringWTF16GetGetRef = O.Nw)(b);
    a._BinaryenStringWTF16GetSetRef = (b, c) => (a._BinaryenStringWTF16GetSetRef = O.Ow)(b, c);
    a._BinaryenStringWTF16GetGetPos = b => (a._BinaryenStringWTF16GetGetPos = O.Pw)(b);
    a._BinaryenStringWTF16GetSetPos = (b, c) => (a._BinaryenStringWTF16GetSetPos = O.Qw)(b, c);
    a._BinaryenStringSliceWTFGetRef = b => (a._BinaryenStringSliceWTFGetRef = O.Rw)(b);
    a._BinaryenStringSliceWTFSetRef = (b, c) => (a._BinaryenStringSliceWTFSetRef = O.Sw)(b, c);
    a._BinaryenStringSliceWTFGetStart = b => (a._BinaryenStringSliceWTFGetStart = O.Tw)(b);
    a._BinaryenStringSliceWTFSetStart = (b, c) => (a._BinaryenStringSliceWTFSetStart = O.Uw)(b, c);
    a._BinaryenStringSliceWTFGetEnd = b => (a._BinaryenStringSliceWTFGetEnd = O.Vw)(b);
    a._BinaryenStringSliceWTFSetEnd = (b, c) => (a._BinaryenStringSliceWTFSetEnd = O.Ww)(b, c);
    a._BinaryenAddFunction = (b, c, g, d, f, h, k) =>
      (a._BinaryenAddFunction = O.Xw)(b, c, g, d, f, h, k);
    a._BinaryenAddFunctionWithHeapType = (b, c, g, d, f, h) =>
      (a._BinaryenAddFunctionWithHeapType = O.Yw)(b, c, g, d, f, h);
    a._BinaryenGetFunction = (b, c) => (a._BinaryenGetFunction = O.Zw)(b, c);
    a._BinaryenRemoveFunction = (b, c) => (a._BinaryenRemoveFunction = O._w)(b, c);
    a._BinaryenGetNumFunctions = b => (a._BinaryenGetNumFunctions = O.$w)(b);
    a._BinaryenGetFunctionByIndex = (b, c) => (a._BinaryenGetFunctionByIndex = O.ax)(b, c);
    a._BinaryenAddGlobal = (b, c, g, d, f) => (a._BinaryenAddGlobal = O.bx)(b, c, g, d, f);
    a._BinaryenGetGlobal = (b, c) => (a._BinaryenGetGlobal = O.cx)(b, c);
    a._BinaryenRemoveGlobal = (b, c) => (a._BinaryenRemoveGlobal = O.dx)(b, c);
    a._BinaryenGetNumGlobals = b => (a._BinaryenGetNumGlobals = O.ex)(b);
    a._BinaryenGetGlobalByIndex = (b, c) => (a._BinaryenGetGlobalByIndex = O.fx)(b, c);
    a._BinaryenAddTag = (b, c, g, d) => (a._BinaryenAddTag = O.gx)(b, c, g, d);
    a._BinaryenGetTag = (b, c) => (a._BinaryenGetTag = O.hx)(b, c);
    a._BinaryenRemoveTag = (b, c) => (a._BinaryenRemoveTag = O.ix)(b, c);
    a._BinaryenAddFunctionImport = (b, c, g, d, f, h) =>
      (a._BinaryenAddFunctionImport = O.jx)(b, c, g, d, f, h);
    a._BinaryenAddTableImport = (b, c, g, d) => (a._BinaryenAddTableImport = O.kx)(b, c, g, d);
    a._BinaryenAddMemoryImport = (b, c, g, d, f) =>
      (a._BinaryenAddMemoryImport = O.lx)(b, c, g, d, f);
    a._BinaryenAddGlobalImport = (b, c, g, d, f, h) =>
      (a._BinaryenAddGlobalImport = O.mx)(b, c, g, d, f, h);
    a._BinaryenAddTagImport = (b, c, g, d, f, h) =>
      (a._BinaryenAddTagImport = O.nx)(b, c, g, d, f, h);
    a._BinaryenAddFunctionExport = (b, c, g) => (a._BinaryenAddFunctionExport = O.ox)(b, c, g);
    a._BinaryenAddTableExport = (b, c, g) => (a._BinaryenAddTableExport = O.px)(b, c, g);
    a._BinaryenAddMemoryExport = (b, c, g) => (a._BinaryenAddMemoryExport = O.qx)(b, c, g);
    a._BinaryenAddGlobalExport = (b, c, g) => (a._BinaryenAddGlobalExport = O.rx)(b, c, g);
    a._BinaryenAddTagExport = (b, c, g) => (a._BinaryenAddTagExport = O.sx)(b, c, g);
    a._BinaryenGetExport = (b, c) => (a._BinaryenGetExport = O.tx)(b, c);
    a._BinaryenRemoveExport = (b, c) => (a._BinaryenRemoveExport = O.ux)(b, c);
    a._BinaryenGetNumExports = b => (a._BinaryenGetNumExports = O.vx)(b);
    a._BinaryenGetExportByIndex = (b, c) => (a._BinaryenGetExportByIndex = O.wx)(b, c);
    a._BinaryenAddTable = (b, c, g, d, f) => (a._BinaryenAddTable = O.xx)(b, c, g, d, f);
    a._BinaryenRemoveTable = (b, c) => (a._BinaryenRemoveTable = O.yx)(b, c);
    a._BinaryenGetNumTables = b => (a._BinaryenGetNumTables = O.zx)(b);
    a._BinaryenGetTable = (b, c) => (a._BinaryenGetTable = O.Ax)(b, c);
    a._BinaryenGetTableByIndex = (b, c) => (a._BinaryenGetTableByIndex = O.Bx)(b, c);
    a._BinaryenAddActiveElementSegment = (b, c, g, d, f, h) =>
      (a._BinaryenAddActiveElementSegment = O.Cx)(b, c, g, d, f, h);
    a._BinaryenAddPassiveElementSegment = (b, c, g, d) =>
      (a._BinaryenAddPassiveElementSegment = O.Dx)(b, c, g, d);
    a._BinaryenRemoveElementSegment = (b, c) => (a._BinaryenRemoveElementSegment = O.Ex)(b, c);
    a._BinaryenGetElementSegment = (b, c) => (a._BinaryenGetElementSegment = O.Fx)(b, c);
    a._BinaryenGetElementSegmentByIndex = (b, c) =>
      (a._BinaryenGetElementSegmentByIndex = O.Gx)(b, c);
    a._BinaryenGetNumElementSegments = b => (a._BinaryenGetNumElementSegments = O.Hx)(b);
    a._BinaryenElementSegmentGetOffset = b => (a._BinaryenElementSegmentGetOffset = O.Ix)(b);
    a._BinaryenElementSegmentGetLength = b => (a._BinaryenElementSegmentGetLength = O.Jx)(b);
    a._BinaryenElementSegmentGetData = (b, c) => (a._BinaryenElementSegmentGetData = O.Kx)(b, c);
    a._BinaryenSetMemory = (b, c, g, d, f, h, k, l, p, q, r, t, A) =>
      (a._BinaryenSetMemory = O.Lx)(b, c, g, d, f, h, k, l, p, q, r, t, A);
    a._BinaryenGetNumMemorySegments = b => (a._BinaryenGetNumMemorySegments = O.Mx)(b);
    a._BinaryenGetMemorySegmentByteOffset = (b, c) =>
      (a._BinaryenGetMemorySegmentByteOffset = O.Nx)(b, c);
    a._BinaryenHasMemory = b => (a._BinaryenHasMemory = O.Ox)(b);
    a._BinaryenMemoryGetInitial = (b, c) => (a._BinaryenMemoryGetInitial = O.Px)(b, c);
    a._BinaryenMemoryHasMax = (b, c) => (a._BinaryenMemoryHasMax = O.Qx)(b, c);
    a._BinaryenMemoryGetMax = (b, c) => (a._BinaryenMemoryGetMax = O.Rx)(b, c);
    a._BinaryenMemoryImportGetModule = (b, c) => (a._BinaryenMemoryImportGetModule = O.Sx)(b, c);
    a._BinaryenMemoryImportGetBase = (b, c) => (a._BinaryenMemoryImportGetBase = O.Tx)(b, c);
    a._BinaryenMemoryIsShared = (b, c) => (a._BinaryenMemoryIsShared = O.Ux)(b, c);
    a._BinaryenMemoryIs64 = (b, c) => (a._BinaryenMemoryIs64 = O.Vx)(b, c);
    a._BinaryenGetMemorySegmentByteLength = (b, c) =>
      (a._BinaryenGetMemorySegmentByteLength = O.Wx)(b, c);
    a._BinaryenGetMemorySegmentPassive = (b, c) =>
      (a._BinaryenGetMemorySegmentPassive = O.Xx)(b, c);
    a._BinaryenCopyMemorySegmentData = (b, c, g) =>
      (a._BinaryenCopyMemorySegmentData = O.Yx)(b, c, g);
    a._BinaryenAddDataSegment = (b, c, g, d, f, h, k) =>
      (a._BinaryenAddDataSegment = O.Zx)(b, c, g, d, f, h, k);
    a._BinaryenSetStart = (b, c) => (a._BinaryenSetStart = O._x)(b, c);
    a._BinaryenGetStart = b => (a._BinaryenGetStart = O.$x)(b);
    a._BinaryenModuleGetFeatures = b => (a._BinaryenModuleGetFeatures = O.ay)(b);
    a._BinaryenModuleSetFeatures = (b, c) => (a._BinaryenModuleSetFeatures = O.by)(b, c);
    a._BinaryenModuleParse = b => (a._BinaryenModuleParse = O.cy)(b);
    a._BinaryenModulePrint = b => (a._BinaryenModulePrint = O.dy)(b);
    a._BinaryenModulePrintStackIR = b => (a._BinaryenModulePrintStackIR = O.ey)(b);
    a._BinaryenModulePrintAsmjs = b => (a._BinaryenModulePrintAsmjs = O.fy)(b);
    a._BinaryenModuleValidate = b => (a._BinaryenModuleValidate = O.gy)(b);
    a._BinaryenModuleOptimize = b => (a._BinaryenModuleOptimize = O.hy)(b);
    a._BinaryenModuleUpdateMaps = b => (a._BinaryenModuleUpdateMaps = O.iy)(b);
    a._BinaryenGetOptimizeLevel = () => (a._BinaryenGetOptimizeLevel = O.jy)();
    a._BinaryenSetOptimizeLevel = b => (a._BinaryenSetOptimizeLevel = O.ky)(b);
    a._BinaryenGetShrinkLevel = () => (a._BinaryenGetShrinkLevel = O.ly)();
    a._BinaryenSetShrinkLevel = b => (a._BinaryenSetShrinkLevel = O.my)(b);
    a._BinaryenGetDebugInfo = () => (a._BinaryenGetDebugInfo = O.ny)();
    a._BinaryenSetDebugInfo = b => (a._BinaryenSetDebugInfo = O.oy)(b);
    a._BinaryenGetTrapsNeverHappen = () => (a._BinaryenGetTrapsNeverHappen = O.py)();
    a._BinaryenSetTrapsNeverHappen = b => (a._BinaryenSetTrapsNeverHappen = O.qy)(b);
    a._BinaryenGetClosedWorld = () => (a._BinaryenGetClosedWorld = O.ry)();
    a._BinaryenSetClosedWorld = b => (a._BinaryenSetClosedWorld = O.sy)(b);
    a._BinaryenGetLowMemoryUnused = () => (a._BinaryenGetLowMemoryUnused = O.ty)();
    a._BinaryenSetLowMemoryUnused = b => (a._BinaryenSetLowMemoryUnused = O.uy)(b);
    a._BinaryenGetZeroFilledMemory = () => (a._BinaryenGetZeroFilledMemory = O.vy)();
    a._BinaryenSetZeroFilledMemory = b => (a._BinaryenSetZeroFilledMemory = O.wy)(b);
    a._BinaryenGetFastMath = () => (a._BinaryenGetFastMath = O.xy)();
    a._BinaryenSetFastMath = b => (a._BinaryenSetFastMath = O.yy)(b);
    a._BinaryenGetGenerateStackIR = () => (a._BinaryenGetGenerateStackIR = O.zy)();
    a._BinaryenSetGenerateStackIR = b => (a._BinaryenSetGenerateStackIR = O.Ay)(b);
    a._BinaryenGetOptimizeStackIR = () => (a._BinaryenGetOptimizeStackIR = O.By)();
    a._BinaryenSetOptimizeStackIR = b => (a._BinaryenSetOptimizeStackIR = O.Cy)(b);
    a._BinaryenGetPassArgument = b => (a._BinaryenGetPassArgument = O.Dy)(b);
    a._BinaryenSetPassArgument = (b, c) => (a._BinaryenSetPassArgument = O.Ey)(b, c);
    a._BinaryenClearPassArguments = () => (a._BinaryenClearPassArguments = O.Fy)();
    a._BinaryenHasPassToSkip = b => (a._BinaryenHasPassToSkip = O.Gy)(b);
    a._BinaryenAddPassToSkip = b => (a._BinaryenAddPassToSkip = O.Hy)(b);
    a._BinaryenClearPassesToSkip = () => (a._BinaryenClearPassesToSkip = O.Iy)();
    a._BinaryenGetAlwaysInlineMaxSize = () => (a._BinaryenGetAlwaysInlineMaxSize = O.Jy)();
    a._BinaryenSetAlwaysInlineMaxSize = b => (a._BinaryenSetAlwaysInlineMaxSize = O.Ky)(b);
    a._BinaryenGetFlexibleInlineMaxSize = () => (a._BinaryenGetFlexibleInlineMaxSize = O.Ly)();
    a._BinaryenSetFlexibleInlineMaxSize = b => (a._BinaryenSetFlexibleInlineMaxSize = O.My)(b);
    a._BinaryenGetMaxCombinedBinarySize = () => (a._BinaryenGetMaxCombinedBinarySize = O.Ny)();
    a._BinaryenSetMaxCombinedBinarySize = b => (a._BinaryenSetMaxCombinedBinarySize = O.Oy)(b);
    a._BinaryenGetOneCallerInlineMaxSize = () => (a._BinaryenGetOneCallerInlineMaxSize = O.Py)();
    a._BinaryenSetOneCallerInlineMaxSize = b => (a._BinaryenSetOneCallerInlineMaxSize = O.Qy)(b);
    a._BinaryenGetAllowInliningFunctionsWithLoops = () =>
      (a._BinaryenGetAllowInliningFunctionsWithLoops = O.Ry)();
    a._BinaryenSetAllowInliningFunctionsWithLoops = b =>
      (a._BinaryenSetAllowInliningFunctionsWithLoops = O.Sy)(b);
    a._BinaryenModuleRunPasses = (b, c, g) => (a._BinaryenModuleRunPasses = O.Ty)(b, c, g);
    a._BinaryenModuleWrite = (b, c, g) => (a._BinaryenModuleWrite = O.Uy)(b, c, g);
    a._BinaryenModuleWriteText = (b, c, g) => (a._BinaryenModuleWriteText = O.Vy)(b, c, g);
    a._BinaryenModuleWriteStackIR = (b, c, g) => (a._BinaryenModuleWriteStackIR = O.Wy)(b, c, g);
    a._BinaryenModuleWriteWithSourceMap = (b, c, g, d, f, h, k) =>
      (a._BinaryenModuleWriteWithSourceMap = O.Xy)(b, c, g, d, f, h, k);
    a._BinaryenModuleAllocateAndWrite = (b, c, g) =>
      (a._BinaryenModuleAllocateAndWrite = O.Yy)(b, c, g);
    var Td = (a._malloc = b => (Td = a._malloc = O.Zy)(b));
    a._BinaryenModuleAllocateAndWriteText = b => (a._BinaryenModuleAllocateAndWriteText = O._y)(b);
    a._BinaryenModuleAllocateAndWriteStackIR = b =>
      (a._BinaryenModuleAllocateAndWriteStackIR = O.$y)(b);
    a._BinaryenModuleReadWithFeatures = (b, c, g) =>
      (a._BinaryenModuleReadWithFeatures = O.az)(b, c, g);
    a._BinaryenModuleRead = (b, c) => (a._BinaryenModuleRead = O.bz)(b, c);
    a._BinaryenModuleInterpret = b => (a._BinaryenModuleInterpret = O.cz)(b);
    a._BinaryenModuleAddDebugInfoFileName = (b, c) =>
      (a._BinaryenModuleAddDebugInfoFileName = O.dz)(b, c);
    a._BinaryenModuleGetDebugInfoFileName = (b, c) =>
      (a._BinaryenModuleGetDebugInfoFileName = O.ez)(b, c);
    a._BinaryenFunctionGetName = b => (a._BinaryenFunctionGetName = O.fz)(b);
    a._BinaryenFunctionGetParams = b => (a._BinaryenFunctionGetParams = O.gz)(b);
    a._BinaryenFunctionGetResults = b => (a._BinaryenFunctionGetResults = O.hz)(b);
    a._BinaryenFunctionGetNumVars = b => (a._BinaryenFunctionGetNumVars = O.iz)(b);
    a._BinaryenFunctionGetVar = (b, c) => (a._BinaryenFunctionGetVar = O.jz)(b, c);
    a._BinaryenFunctionAddVar = (b, c) => (a._BinaryenFunctionAddVar = O.kz)(b, c);
    a._BinaryenFunctionGetNumLocals = b => (a._BinaryenFunctionGetNumLocals = O.lz)(b);
    a._BinaryenFunctionHasLocalName = (b, c) => (a._BinaryenFunctionHasLocalName = O.mz)(b, c);
    a._BinaryenFunctionGetLocalName = (b, c) => (a._BinaryenFunctionGetLocalName = O.nz)(b, c);
    a._BinaryenFunctionSetLocalName = (b, c, g) =>
      (a._BinaryenFunctionSetLocalName = O.oz)(b, c, g);
    a._BinaryenFunctionGetBody = b => (a._BinaryenFunctionGetBody = O.pz)(b);
    a._BinaryenFunctionSetBody = (b, c) => (a._BinaryenFunctionSetBody = O.qz)(b, c);
    a._BinaryenFunctionGetType = b => (a._BinaryenFunctionGetType = O.rz)(b);
    a._BinaryenFunctionSetType = (b, c) => (a._BinaryenFunctionSetType = O.sz)(b, c);
    a._BinaryenFunctionOptimize = (b, c) => (a._BinaryenFunctionOptimize = O.tz)(b, c);
    a._BinaryenFunctionRunPasses = (b, c, g, d) =>
      (a._BinaryenFunctionRunPasses = O.uz)(b, c, g, d);
    a._BinaryenFunctionSetDebugLocation = (b, c, g, d, f) =>
      (a._BinaryenFunctionSetDebugLocation = O.vz)(b, c, g, d, f);
    a._BinaryenTableGetName = b => (a._BinaryenTableGetName = O.wz)(b);
    a._BinaryenTableSetName = (b, c) => (a._BinaryenTableSetName = O.xz)(b, c);
    a._BinaryenTableGetInitial = b => (a._BinaryenTableGetInitial = O.yz)(b);
    a._BinaryenTableSetInitial = (b, c) => (a._BinaryenTableSetInitial = O.zz)(b, c);
    a._BinaryenTableHasMax = b => (a._BinaryenTableHasMax = O.Az)(b);
    a._BinaryenTableGetMax = b => (a._BinaryenTableGetMax = O.Bz)(b);
    a._BinaryenTableSetMax = (b, c) => (a._BinaryenTableSetMax = O.Cz)(b, c);
    a._BinaryenTableGetType = b => (a._BinaryenTableGetType = O.Dz)(b);
    a._BinaryenTableSetType = (b, c) => (a._BinaryenTableSetType = O.Ez)(b, c);
    a._BinaryenElementSegmentGetName = b => (a._BinaryenElementSegmentGetName = O.Fz)(b);
    a._BinaryenElementSegmentSetName = (b, c) => (a._BinaryenElementSegmentSetName = O.Gz)(b, c);
    a._BinaryenElementSegmentGetTable = b => (a._BinaryenElementSegmentGetTable = O.Hz)(b);
    a._BinaryenElementSegmentSetTable = (b, c) => (a._BinaryenElementSegmentSetTable = O.Iz)(b, c);
    a._BinaryenElementSegmentIsPassive = b => (a._BinaryenElementSegmentIsPassive = O.Jz)(b);
    a._BinaryenGlobalGetName = b => (a._BinaryenGlobalGetName = O.Kz)(b);
    a._BinaryenGlobalGetType = b => (a._BinaryenGlobalGetType = O.Lz)(b);
    a._BinaryenGlobalIsMutable = b => (a._BinaryenGlobalIsMutable = O.Mz)(b);
    a._BinaryenGlobalGetInitExpr = b => (a._BinaryenGlobalGetInitExpr = O.Nz)(b);
    a._BinaryenTagGetName = b => (a._BinaryenTagGetName = O.Oz)(b);
    a._BinaryenTagGetParams = b => (a._BinaryenTagGetParams = O.Pz)(b);
    a._BinaryenTagGetResults = b => (a._BinaryenTagGetResults = O.Qz)(b);
    a._BinaryenFunctionImportGetModule = b => (a._BinaryenFunctionImportGetModule = O.Rz)(b);
    a._BinaryenTableImportGetModule = b => (a._BinaryenTableImportGetModule = O.Sz)(b);
    a._BinaryenGlobalImportGetModule = b => (a._BinaryenGlobalImportGetModule = O.Tz)(b);
    a._BinaryenTagImportGetModule = b => (a._BinaryenTagImportGetModule = O.Uz)(b);
    a._BinaryenFunctionImportGetBase = b => (a._BinaryenFunctionImportGetBase = O.Vz)(b);
    a._BinaryenTableImportGetBase = b => (a._BinaryenTableImportGetBase = O.Wz)(b);
    a._BinaryenGlobalImportGetBase = b => (a._BinaryenGlobalImportGetBase = O.Xz)(b);
    a._BinaryenTagImportGetBase = b => (a._BinaryenTagImportGetBase = O.Yz)(b);
    a._BinaryenExportGetKind = b => (a._BinaryenExportGetKind = O.Zz)(b);
    a._BinaryenExportGetName = b => (a._BinaryenExportGetName = O._z)(b);
    a._BinaryenExportGetValue = b => (a._BinaryenExportGetValue = O.$z)(b);
    a._BinaryenAddCustomSection = (b, c, g, d) => (a._BinaryenAddCustomSection = O.aA)(b, c, g, d);
    a._BinaryenSideEffectNone = () => (a._BinaryenSideEffectNone = O.bA)();
    a._BinaryenSideEffectBranches = () => (a._BinaryenSideEffectBranches = O.cA)();
    a._BinaryenSideEffectCalls = () => (a._BinaryenSideEffectCalls = O.dA)();
    a._BinaryenSideEffectReadsLocal = () => (a._BinaryenSideEffectReadsLocal = O.eA)();
    a._BinaryenSideEffectWritesLocal = () => (a._BinaryenSideEffectWritesLocal = O.fA)();
    a._BinaryenSideEffectReadsGlobal = () => (a._BinaryenSideEffectReadsGlobal = O.gA)();
    a._BinaryenSideEffectWritesGlobal = () => (a._BinaryenSideEffectWritesGlobal = O.hA)();
    a._BinaryenSideEffectReadsMemory = () => (a._BinaryenSideEffectReadsMemory = O.iA)();
    a._BinaryenSideEffectWritesMemory = () => (a._BinaryenSideEffectWritesMemory = O.jA)();
    a._BinaryenSideEffectReadsTable = () => (a._BinaryenSideEffectReadsTable = O.kA)();
    a._BinaryenSideEffectWritesTable = () => (a._BinaryenSideEffectWritesTable = O.lA)();
    a._BinaryenSideEffectImplicitTrap = () => (a._BinaryenSideEffectImplicitTrap = O.mA)();
    a._BinaryenSideEffectTrapsNeverHappen = () => (a._BinaryenSideEffectTrapsNeverHappen = O.nA)();
    a._BinaryenSideEffectIsAtomic = () => (a._BinaryenSideEffectIsAtomic = O.oA)();
    a._BinaryenSideEffectThrows = () => (a._BinaryenSideEffectThrows = O.pA)();
    a._BinaryenSideEffectDanglingPop = () => (a._BinaryenSideEffectDanglingPop = O.qA)();
    a._BinaryenSideEffectAny = () => (a._BinaryenSideEffectAny = O.rA)();
    a._BinaryenExpressionGetSideEffects = (b, c) =>
      (a._BinaryenExpressionGetSideEffects = O.sA)(b, c);
    a._RelooperCreate = b => (a._RelooperCreate = O.tA)(b);
    a._RelooperAddBlock = (b, c) => (a._RelooperAddBlock = O.uA)(b, c);
    a._RelooperAddBranch = (b, c, g, d) => (a._RelooperAddBranch = O.vA)(b, c, g, d);
    a._RelooperAddBlockWithSwitch = (b, c, g) => (a._RelooperAddBlockWithSwitch = O.wA)(b, c, g);
    a._RelooperAddBranchForSwitch = (b, c, g, d, f) =>
      (a._RelooperAddBranchForSwitch = O.xA)(b, c, g, d, f);
    a._RelooperRenderAndDispose = (b, c, g) => (a._RelooperRenderAndDispose = O.yA)(b, c, g);
    a._ExpressionRunnerFlagsDefault = () => (a._ExpressionRunnerFlagsDefault = O.zA)();
    a._ExpressionRunnerFlagsPreserveSideeffects = () =>
      (a._ExpressionRunnerFlagsPreserveSideeffects = O.AA)();
    a._ExpressionRunnerCreate = (b, c, g, d) => (a._ExpressionRunnerCreate = O.BA)(b, c, g, d);
    a._ExpressionRunnerSetLocalValue = (b, c, g) =>
      (a._ExpressionRunnerSetLocalValue = O.CA)(b, c, g);
    a._ExpressionRunnerSetGlobalValue = (b, c, g) =>
      (a._ExpressionRunnerSetGlobalValue = O.DA)(b, c, g);
    a._ExpressionRunnerRunAndDispose = (b, c) => (a._ExpressionRunnerRunAndDispose = O.EA)(b, c);
    a._TypeBuilderErrorReasonSelfSupertype = () =>
      (a._TypeBuilderErrorReasonSelfSupertype = O.FA)();
    a._TypeBuilderErrorReasonInvalidSupertype = () =>
      (a._TypeBuilderErrorReasonInvalidSupertype = O.GA)();
    a._TypeBuilderErrorReasonForwardSupertypeReference = () =>
      (a._TypeBuilderErrorReasonForwardSupertypeReference = O.HA)();
    a._TypeBuilderErrorReasonForwardChildReference = () =>
      (a._TypeBuilderErrorReasonForwardChildReference = O.IA)();
    a._TypeBuilderCreate = b => (a._TypeBuilderCreate = O.JA)(b);
    a._TypeBuilderGrow = (b, c) => (a._TypeBuilderGrow = O.KA)(b, c);
    a._TypeBuilderGetSize = b => (a._TypeBuilderGetSize = O.LA)(b);
    a._TypeBuilderSetSignatureType = (b, c, g, d) =>
      (a._TypeBuilderSetSignatureType = O.MA)(b, c, g, d);
    a._TypeBuilderSetStructType = (b, c, g, d, f, h) =>
      (a._TypeBuilderSetStructType = O.NA)(b, c, g, d, f, h);
    a._TypeBuilderSetArrayType = (b, c, g, d, f) =>
      (a._TypeBuilderSetArrayType = O.OA)(b, c, g, d, f);
    a._TypeBuilderGetTempHeapType = (b, c) => (a._TypeBuilderGetTempHeapType = O.PA)(b, c);
    a._TypeBuilderGetTempTupleType = (b, c, g) => (a._TypeBuilderGetTempTupleType = O.QA)(b, c, g);
    a._TypeBuilderGetTempRefType = (b, c, g) => (a._TypeBuilderGetTempRefType = O.RA)(b, c, g);
    a._TypeBuilderSetSubType = (b, c, g) => (a._TypeBuilderSetSubType = O.SA)(b, c, g);
    a._TypeBuilderSetOpen = (b, c) => (a._TypeBuilderSetOpen = O.TA)(b, c);
    a._TypeBuilderCreateRecGroup = (b, c, g) => (a._TypeBuilderCreateRecGroup = O.UA)(b, c, g);
    a._TypeBuilderBuildAndDispose = (b, c, g, d) =>
      (a._TypeBuilderBuildAndDispose = O.VA)(b, c, g, d);
    a._BinaryenModuleSetTypeName = (b, c, g) => (a._BinaryenModuleSetTypeName = O.WA)(b, c, g);
    a._BinaryenModuleSetFieldName = (b, c, g, d) =>
      (a._BinaryenModuleSetFieldName = O.XA)(b, c, g, d);
    a._BinaryenSetColorsEnabled = b => (a._BinaryenSetColorsEnabled = O.YA)(b);
    a._BinaryenAreColorsEnabled = () => (a._BinaryenAreColorsEnabled = O.ZA)();
    var Ud = (a._BinaryenSizeofLiteral = () => (Ud = a._BinaryenSizeofLiteral = O._A)()),
      Vd = (a._BinaryenSizeofAllocateAndWriteResult = () =>
        (Vd = a._BinaryenSizeofAllocateAndWriteResult = O.$A)());
    a.__i32_store8 = (b, c) => (a.__i32_store8 = O.aB)(b, c);
    a.__i32_store16 = (b, c) => (a.__i32_store16 = O.bB)(b, c);
    a.__i32_store = (b, c) => (a.__i32_store = O.cB)(b, c);
    a.__f32_store = (b, c) => (a.__f32_store = O.dB)(b, c);
    a.__f64_store = (b, c) => (a.__f64_store = O.eB)(b, c);
    a.__i32_load8_s = b => (a.__i32_load8_s = O.fB)(b);
    a.__i32_load8_u = b => (a.__i32_load8_u = O.gB)(b);
    a.__i32_load16_s = b => (a.__i32_load16_s = O.hB)(b);
    a.__i32_load16_u = b => (a.__i32_load16_u = O.iB)(b);
    a.__i32_load = b => (a.__i32_load = O.jB)(b);
    a.__f32_load = b => (a.__f32_load = O.kB)(b);
    a.__f64_load = b => (a.__f64_load = O.lB)(b);
    var Wd = (a._free = b => (Wd = a._free = O.mB)(b)),
      M = (b, c) => (M = O.oB)(b, c),
      Ta = b => (Ta = O.pB)(b),
      P = b => (P = O.qB)(b),
      L = b => (L = O.rB)(b),
      R = () => (R = O.sB)(),
      pc = b => (pc = O.tB)(b),
      oc = b => (oc = O.uB)(b),
      Ua = (b, c, g) => (Ua = O.vB)(b, c, g),
      Ra = b => (Ra = O.wB)(b),
      Xd = (a.dynCall_viij = (b, c, g, d, f) => (Xd = a.dynCall_viij = O.xB)(b, c, g, d, f)),
      Yd = (a.dynCall_iij = (b, c, g, d) => (Yd = a.dynCall_iij = O.yB)(b, c, g, d)),
      Zd = (a.dynCall_viiij = (b, c, g, d, f, h) =>
        (Zd = a.dynCall_viiij = O.zB)(b, c, g, d, f, h)),
      $d = (a.dynCall_iiij = (b, c, g, d, f) => ($d = a.dynCall_iiij = O.AB)(b, c, g, d, f)),
      ae = (a.dynCall_viiji = (b, c, g, d, f, h) =>
        (ae = a.dynCall_viiji = O.BB)(b, c, g, d, f, h)),
      be = (a.dynCall_viji = (b, c, g, d, f) => (be = a.dynCall_viji = O.CB)(b, c, g, d, f)),
      ce = (a.dynCall_iiji = (b, c, g, d, f) => (ce = a.dynCall_iiji = O.DB)(b, c, g, d, f)),
      de = (a.dynCall_vij = (b, c, g, d) => (de = a.dynCall_vij = O.EB)(b, c, g, d)),
      ee = (a.dynCall_ijiii = (b, c, g, d, f, h) =>
        (ee = a.dynCall_ijiii = O.FB)(b, c, g, d, f, h)),
      fe = (a.dynCall_iji = (b, c, g, d) => (fe = a.dynCall_iji = O.GB)(b, c, g, d)),
      ge = (a.dynCall_iiiiij = (b, c, g, d, f, h, k) =>
        (ge = a.dynCall_iiiiij = O.HB)(b, c, g, d, f, h, k)),
      he = (a.dynCall_viiiiji = (b, c, g, d, f, h, k, l) =>
        (he = a.dynCall_viiiiji = O.IB)(b, c, g, d, f, h, k, l)),
      ie = (a.dynCall_viiiiij = (b, c, g, d, f, h, k, l) =>
        (ie = a.dynCall_viiiiij = O.JB)(b, c, g, d, f, h, k, l)),
      je = (a.dynCall_iiijii = (b, c, g, d, f, h, k) =>
        (je = a.dynCall_iiijii = O.KB)(b, c, g, d, f, h, k)),
      ke = (a.dynCall_ijjiiij = (b, c, g, d, f, h, k, l, p, q) =>
        (ke = a.dynCall_ijjiiij = O.LB)(b, c, g, d, f, h, k, l, p, q)),
      le = (a.dynCall_vijji = (b, c, g, d, f, h, k) =>
        (le = a.dynCall_vijji = O.MB)(b, c, g, d, f, h, k)),
      me = (a.dynCall_vijij = (b, c, g, d, f, h, k) =>
        (me = a.dynCall_vijij = O.NB)(b, c, g, d, f, h, k)),
      ne = (a.dynCall_viijiijj = (b, c, g, d, f, h, k, l, p, q, r) =>
        (ne = a.dynCall_viijiijj = O.OB)(b, c, g, d, f, h, k, l, p, q, r)),
      oe = (a.dynCall_vijiijj = (b, c, g, d, f, h, k, l, p, q) =>
        (oe = a.dynCall_vijiijj = O.PB)(b, c, g, d, f, h, k, l, p, q)),
      pe = (a.dynCall_jiiiij = (b, c, g, d, f, h, k) =>
        (pe = a.dynCall_jiiiij = O.QB)(b, c, g, d, f, h, k)),
      qe = (a.dynCall_iiiij = (b, c, g, d, f, h) =>
        (qe = a.dynCall_iiiij = O.RB)(b, c, g, d, f, h)),
      re = (a.dynCall_j = b => (re = a.dynCall_j = O.SB)(b)),
      se = (a.dynCall_vijiii = (b, c, g, d, f, h, k) =>
        (se = a.dynCall_vijiii = O.TB)(b, c, g, d, f, h, k)),
      te = (a.dynCall_vijii = (b, c, g, d, f, h) =>
        (te = a.dynCall_vijii = O.UB)(b, c, g, d, f, h)),
      ue = (a.dynCall_iijiii = (b, c, g, d, f, h, k) =>
        (ue = a.dynCall_iijiii = O.VB)(b, c, g, d, f, h, k)),
      ve = (a.dynCall_ijiiii = (b, c, g, d, f, h, k) =>
        (ve = a.dynCall_ijiiii = O.WB)(b, c, g, d, f, h, k)),
      we = (a.dynCall_iijiiii = (b, c, g, d, f, h, k, l) =>
        (we = a.dynCall_iijiiii = O.XB)(b, c, g, d, f, h, k, l)),
      xe = (a.dynCall_iijij = (b, c, g, d, f, h, k) =>
        (xe = a.dynCall_iijij = O.YB)(b, c, g, d, f, h, k)),
      ye = (a.dynCall_iijii = (b, c, g, d, f, h) =>
        (ye = a.dynCall_iijii = O.ZB)(b, c, g, d, f, h)),
      ze = (a.dynCall_iiiji = (b, c, g, d, f, h) =>
        (ze = a.dynCall_iiiji = O._B)(b, c, g, d, f, h)),
      Ae = (a.dynCall_viijj = (b, c, g, d, f, h, k) =>
        (Ae = a.dynCall_viijj = O.$B)(b, c, g, d, f, h, k)),
      Be = (a.dynCall_ji = (b, c) => (Be = a.dynCall_ji = O.aC)(b, c)),
      Ce = (a.dynCall_jii = (b, c, g) => (Ce = a.dynCall_jii = O.bC)(b, c, g)),
      De = (a.dynCall_viiijiiii = (b, c, g, d, f, h, k, l, p, q) =>
        (De = a.dynCall_viiijiiii = O.cC)(b, c, g, d, f, h, k, l, p, q)),
      Ee = (a.dynCall_viiiij = (b, c, g, d, f, h, k) =>
        (Ee = a.dynCall_viiiij = O.dC)(b, c, g, d, f, h, k)),
      Fe = (a.dynCall_iiiiiiij = (b, c, g, d, f, h, k, l, p) =>
        (Fe = a.dynCall_iiiiiiij = O.eC)(b, c, g, d, f, h, k, l, p)),
      Ge = (a.dynCall_iijiiiij = (b, c, g, d, f, h, k, l, p, q) =>
        (Ge = a.dynCall_iijiiiij = O.fC)(b, c, g, d, f, h, k, l, p, q)),
      He = (a.dynCall_iiiiiij = (b, c, g, d, f, h, k, l) =>
        (He = a.dynCall_iiiiiij = O.gC)(b, c, g, d, f, h, k, l)),
      Ie = (a.dynCall_viijiiii = (b, c, g, d, f, h, k, l, p) =>
        (Ie = a.dynCall_viijiiii = O.hC)(b, c, g, d, f, h, k, l, p)),
      Je = (a.dynCall_viijiii = (b, c, g, d, f, h, k, l) =>
        (Je = a.dynCall_viijiii = O.iC)(b, c, g, d, f, h, k, l)),
      Ke = (a.dynCall_viiijji = (b, c, g, d, f, h, k, l, p) =>
        (Ke = a.dynCall_viiijji = O.jC)(b, c, g, d, f, h, k, l, p)),
      Le = (a.dynCall_viijii = (b, c, g, d, f, h, k) =>
        (Le = a.dynCall_viijii = O.kC)(b, c, g, d, f, h, k)),
      Me = (a.dynCall_viijiiiii = (b, c, g, d, f, h, k, l, p, q) =>
        (Me = a.dynCall_viijiiiii = O.lC)(b, c, g, d, f, h, k, l, p, q)),
      Ne = (a.dynCall_viiijij = (b, c, g, d, f, h, k, l, p) =>
        (Ne = a.dynCall_viiijij = O.mC)(b, c, g, d, f, h, k, l, p)),
      Oe = (a.dynCall_viiiijiij = (b, c, g, d, f, h, k, l, p, q, r) =>
        (Oe = a.dynCall_viiiijiij = O.nC)(b, c, g, d, f, h, k, l, p, q, r)),
      Pe = (a.dynCall_viiijiij = (b, c, g, d, f, h, k, l, p, q) =>
        (Pe = a.dynCall_viiijiij = O.oC)(b, c, g, d, f, h, k, l, p, q)),
      Qe = (a.dynCall_viiiijij = (b, c, g, d, f, h, k, l, p, q) =>
        (Qe = a.dynCall_viiiijij = O.pC)(b, c, g, d, f, h, k, l, p, q)),
      Re = (a.dynCall_viiijj = (b, c, g, d, f, h, k, l) =>
        (Re = a.dynCall_viiijj = O.qC)(b, c, g, d, f, h, k, l)),
      Se = (a.dynCall_viiijii = (b, c, g, d, f, h, k, l) =>
        (Se = a.dynCall_viiijii = O.rC)(b, c, g, d, f, h, k, l)),
      Te = (a.dynCall_viiiiijii = (b, c, g, d, f, h, k, l, p, q) =>
        (Te = a.dynCall_viiiiijii = O.sC)(b, c, g, d, f, h, k, l, p, q)),
      Ue = (a.dynCall_iiijiii = (b, c, g, d, f, h, k, l) =>
        (Ue = a.dynCall_iiijiii = O.tC)(b, c, g, d, f, h, k, l)),
      Ve = (a.dynCall_viijji = (b, c, g, d, f, h, k, l) =>
        (Ve = a.dynCall_viijji = O.uC)(b, c, g, d, f, h, k, l)),
      We = (a.dynCall_jiji = (b, c, g, d, f) => (We = a.dynCall_jiji = O.vC)(b, c, g, d, f)),
      Xe = (a.dynCall_iiijj = (b, c, g, d, f, h, k) =>
        (Xe = a.dynCall_iiijj = O.wC)(b, c, g, d, f, h, k)),
      Ye = (a.dynCall_viiiji = (b, c, g, d, f, h, k) =>
        (Ye = a.dynCall_viiiji = O.xC)(b, c, g, d, f, h, k));
    function dd(b, c, g) {
      var d = R();
      try {
        K.get(b)(c, g);
      } catch (f) {
        P(d);
        if (f !== f + 0) throw f;
        M(1, 0);
      }
    }
    function rc(b, c) {
      var g = R();
      try {
        return K.get(b)(c);
      } catch (d) {
        P(g);
        if (d !== d + 0) throw d;
        M(1, 0);
      }
    }
    function uc(b, c, g, d) {
      var f = R();
      try {
        return K.get(b)(c, g, d);
      } catch (h) {
        P(f);
        if (h !== h + 0) throw h;
        M(1, 0);
      }
    }
    function tc(b, c, g) {
      var d = R();
      try {
        return K.get(b)(c, g);
      } catch (f) {
        P(d);
        if (f !== f + 0) throw f;
        M(1, 0);
      }
    }
    function $c(b) {
      var c = R();
      try {
        K.get(b)();
      } catch (g) {
        P(c);
        if (g !== g + 0) throw g;
        M(1, 0);
      }
    }
    function vc(b, c, g, d, f) {
      var h = R();
      try {
        return K.get(b)(c, g, d, f);
      } catch (k) {
        P(h);
        if (k !== k + 0) throw k;
        M(1, 0);
      }
    }
    function gd(b, c, g, d, f) {
      var h = R();
      try {
        K.get(b)(c, g, d, f);
      } catch (k) {
        P(h);
        if (k !== k + 0) throw k;
        M(1, 0);
      }
    }
    function ad(b, c) {
      var g = R();
      try {
        K.get(b)(c);
      } catch (d) {
        P(g);
        if (d !== d + 0) throw d;
        M(1, 0);
      }
    }
    function fd(b, c, g, d) {
      var f = R();
      try {
        K.get(b)(c, g, d);
      } catch (h) {
        P(f);
        if (h !== h + 0) throw h;
        M(1, 0);
      }
    }
    function hd(b, c, g, d, f, h) {
      var k = R();
      try {
        K.get(b)(c, g, d, f, h);
      } catch (l) {
        P(k);
        if (l !== l + 0) throw l;
        M(1, 0);
      }
    }
    function ed(b, c, g, d, f) {
      var h = R();
      try {
        K.get(b)(c, g, d, f);
      } catch (k) {
        P(h);
        if (k !== k + 0) throw k;
        M(1, 0);
      }
    }
    function cd(b, c, g) {
      var d = R();
      try {
        K.get(b)(c, g);
      } catch (f) {
        P(d);
        if (f !== f + 0) throw f;
        M(1, 0);
      }
    }
    function yc(b, c, g, d, f, h, k) {
      var l = R();
      try {
        return K.get(b)(c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function qc(b) {
      var c = R();
      try {
        return K.get(b)();
      } catch (g) {
        P(c);
        if (g !== g + 0) throw g;
        M(1, 0);
      }
    }
    function xc(b, c, g, d, f, h) {
      var k = R();
      try {
        return K.get(b)(c, g, d, f, h);
      } catch (l) {
        P(k);
        if (l !== l + 0) throw l;
        M(1, 0);
      }
    }
    function sc(b, c, g) {
      var d = R();
      try {
        return K.get(b)(c, g);
      } catch (f) {
        P(d);
        if (f !== f + 0) throw f;
        M(1, 0);
      }
    }
    function jd(b, c, g, d, f, h, k) {
      var l = R();
      try {
        K.get(b)(c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function kd(b, c, g, d, f, h, k, l) {
      var p = R();
      try {
        K.get(b)(c, g, d, f, h, k, l);
      } catch (q) {
        P(p);
        if (q !== q + 0) throw q;
        M(1, 0);
      }
    }
    function ld(b, c, g, d, f, h, k, l, p, q) {
      var r = R();
      try {
        K.get(b)(c, g, d, f, h, k, l, p, q);
      } catch (t) {
        P(r);
        if (t !== t + 0) throw t;
        M(1, 0);
      }
    }
    function bd(b, c, g) {
      var d = R();
      try {
        K.get(b)(c, g);
      } catch (f) {
        P(d);
        if (f !== f + 0) throw f;
        M(1, 0);
      }
    }
    function wc(b, c, g, d, f, h) {
      var k = R();
      try {
        return K.get(b)(c, g, d, f, h);
      } catch (l) {
        P(k);
        if (l !== l + 0) throw l;
        M(1, 0);
      }
    }
    function zc(b, c, g, d, f, h, k, l) {
      var p = R();
      try {
        return K.get(b)(c, g, d, f, h, k, l);
      } catch (q) {
        P(p);
        if (q !== q + 0) throw q;
        M(1, 0);
      }
    }
    function Ac(b, c, g, d, f, h, k, l, p, q, r, t) {
      var A = R();
      try {
        return K.get(b)(c, g, d, f, h, k, l, p, q, r, t);
      } catch (D) {
        P(A);
        if (D !== D + 0) throw D;
        M(1, 0);
      }
    }
    function md(b, c, g, d, f, h, k, l, p, q, r) {
      var t = R();
      try {
        K.get(b)(c, g, d, f, h, k, l, p, q, r);
      } catch (A) {
        P(t);
        if (A !== A + 0) throw A;
        M(1, 0);
      }
    }
    function nd(b, c, g, d, f, h, k, l, p, q, r, t, A, D, G, H) {
      var J = R();
      try {
        K.get(b)(c, g, d, f, h, k, l, p, q, r, t, A, D, G, H);
      } catch (Q) {
        P(J);
        if (Q !== Q + 0) throw Q;
        M(1, 0);
      }
    }
    function Kc(b, c, g, d) {
      var f = R();
      try {
        return Yd(b, c, g, d);
      } catch (h) {
        P(f);
        if (h !== h + 0) throw h;
        M(1, 0);
      }
    }
    function Dd(b, c, g, d, f, h) {
      var k = R();
      try {
        ae(b, c, g, d, f, h);
      } catch (l) {
        P(k);
        if (l !== l + 0) throw l;
        M(1, 0);
      }
    }
    function Cd(b, c, g, d, f) {
      var h = R();
      try {
        Xd(b, c, g, d, f);
      } catch (k) {
        P(h);
        if (k !== k + 0) throw k;
        M(1, 0);
      }
    }
    function ud(b, c, g, d, f, h) {
      var k = R();
      try {
        Zd(b, c, g, d, f, h);
      } catch (l) {
        P(k);
        if (l !== l + 0) throw l;
        M(1, 0);
      }
    }
    function Fc(b, c, g, d, f) {
      var h = R();
      try {
        return $d(b, c, g, d, f);
      } catch (k) {
        P(h);
        if (k !== k + 0) throw k;
        M(1, 0);
      }
    }
    function Ld(b, c, g, d) {
      var f = R();
      try {
        de(b, c, g, d);
      } catch (h) {
        P(f);
        if (h !== h + 0) throw h;
        M(1, 0);
      }
    }
    function Uc(b, c, g, d, f, h, k, l, p, q) {
      var r = R();
      try {
        return ke(b, c, g, d, f, h, k, l, p, q);
      } catch (t) {
        P(r);
        if (t !== t + 0) throw t;
        M(1, 0);
      }
    }
    function Md(b, c, g, d, f) {
      var h = R();
      try {
        be(b, c, g, d, f);
      } catch (k) {
        P(h);
        if (k !== k + 0) throw k;
        M(1, 0);
      }
    }
    function Lc(b, c, g, d, f) {
      var h = R();
      try {
        return ce(b, c, g, d, f);
      } catch (k) {
        P(h);
        if (k !== k + 0) throw k;
        M(1, 0);
      }
    }
    function Sc(b, c, g, d, f, h) {
      var k = R();
      try {
        return ee(b, c, g, d, f, h);
      } catch (l) {
        P(k);
        if (l !== l + 0) throw l;
        M(1, 0);
      }
    }
    function Rc(b, c, g, d) {
      var f = R();
      try {
        return fe(b, c, g, d);
      } catch (h) {
        P(f);
        if (h !== h + 0) throw h;
        M(1, 0);
      }
    }
    function Rd(b, c, g, d, f, h, k) {
      var l = R();
      try {
        le(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Qd(b, c, g, d, f, h, k) {
      var l = R();
      try {
        me(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function vd(b, c, g, d, f, h, k) {
      var l = R();
      try {
        Ye(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Ed(b, c, g, d, f, h, k) {
      var l = R();
      try {
        Le(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Id(b, c, g, d, f, h, k, l, p, q, r) {
      var t = R();
      try {
        ne(b, c, g, d, f, h, k, l, p, q, r);
      } catch (A) {
        P(t);
        if (A !== A + 0) throw A;
        M(1, 0);
      }
    }
    function Pd(b, c, g, d, f, h, k, l, p, q) {
      var r = R();
      try {
        oe(b, c, g, d, f, h, k, l, p, q);
      } catch (t) {
        P(r);
        if (t !== t + 0) throw t;
        M(1, 0);
      }
    }
    function Yc(b, c, g, d, f, h, k) {
      var l = R();
      try {
        return pe(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Zc(b, c, g, d, f) {
      var h = R();
      try {
        return We(b, c, g, d, f);
      } catch (k) {
        P(h);
        if (k !== k + 0) throw k;
        M(1, 0);
      }
    }
    function Nd(b, c, g, d, f, h) {
      var k = R();
      try {
        te(b, c, g, d, f, h);
      } catch (l) {
        P(k);
        if (l !== l + 0) throw l;
        M(1, 0);
      }
    }
    function Jc(b, c, g, d, f, h, k) {
      var l = R();
      try {
        return Xe(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Od(b, c, g, d, f, h, k) {
      var l = R();
      try {
        se(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Hc(b, c, g, d, f, h, k) {
      var l = R();
      try {
        return je(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Ec(b, c, g, d, f, h) {
      var k = R();
      try {
        return qe(b, c, g, d, f, h);
      } catch (l) {
        P(k);
        if (l !== l + 0) throw l;
        M(1, 0);
      }
    }
    function Nc(b, c, g, d, f, h, k) {
      var l = R();
      try {
        return ue(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Tc(b, c, g, d, f, h, k) {
      var l = R();
      try {
        return ve(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Oc(b, c, g, d, f, h, k, l) {
      var p = R();
      try {
        return we(b, c, g, d, f, h, k, l);
      } catch (q) {
        P(p);
        if (q !== q + 0) throw q;
        M(1, 0);
      }
    }
    function Qc(b, c, g, d, f, h, k) {
      var l = R();
      try {
        return xe(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Mc(b, c, g, d, f, h) {
      var k = R();
      try {
        return ye(b, c, g, d, f, h);
      } catch (l) {
        P(k);
        if (l !== l + 0) throw l;
        M(1, 0);
      }
    }
    function Gc(b, c, g, d, f, h) {
      var k = R();
      try {
        return ze(b, c, g, d, f, h);
      } catch (l) {
        P(k);
        if (l !== l + 0) throw l;
        M(1, 0);
      }
    }
    function Dc(b, c, g, d, f, h, k) {
      var l = R();
      try {
        return ge(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Jd(b, c, g, d, f, h, k) {
      var l = R();
      try {
        Ae(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Wc(b, c) {
      var g = R();
      try {
        return Be(b, c);
      } catch (d) {
        P(g);
        if (d !== d + 0) throw d;
        M(1, 0);
      }
    }
    function xd(b, c, g, d, f, h, k, l, p, q) {
      var r = R();
      try {
        De(b, c, g, d, f, h, k, l, p, q);
      } catch (t) {
        P(r);
        if (t !== t + 0) throw t;
        M(1, 0);
      }
    }
    function qd(b, c, g, d, f, h, k) {
      var l = R();
      try {
        Ee(b, c, g, d, f, h, k);
      } catch (p) {
        P(l);
        if (p !== p + 0) throw p;
        M(1, 0);
      }
    }
    function Bc(b, c, g, d, f, h, k, l, p) {
      var q = R();
      try {
        return Fe(b, c, g, d, f, h, k, l, p);
      } catch (r) {
        P(q);
        if (r !== r + 0) throw r;
        M(1, 0);
      }
    }
    function Pc(b, c, g, d, f, h, k, l, p, q) {
      var r = R();
      try {
        return Ge(b, c, g, d, f, h, k, l, p, q);
      } catch (t) {
        P(r);
        if (t !== t + 0) throw t;
        M(1, 0);
      }
    }
    function Cc(b, c, g, d, f, h, k, l) {
      var p = R();
      try {
        return He(b, c, g, d, f, h, k, l);
      } catch (q) {
        P(p);
        if (q !== q + 0) throw q;
        M(1, 0);
      }
    }
    function Gd(b, c, g, d, f, h, k, l, p) {
      var q = R();
      try {
        Ie(b, c, g, d, f, h, k, l, p);
      } catch (r) {
        P(q);
        if (r !== r + 0) throw r;
        M(1, 0);
      }
    }
    function Fd(b, c, g, d, f, h, k, l) {
      var p = R();
      try {
        Je(b, c, g, d, f, h, k, l);
      } catch (q) {
        P(p);
        if (q !== q + 0) throw q;
        M(1, 0);
      }
    }
    function Bd(b, c, g, d, f, h, k, l, p) {
      var q = R();
      try {
        Ke(b, c, g, d, f, h, k, l, p);
      } catch (r) {
        P(q);
        if (r !== r + 0) throw r;
        M(1, 0);
      }
    }
    function Hd(b, c, g, d, f, h, k, l, p, q) {
      var r = R();
      try {
        Me(b, c, g, d, f, h, k, l, p, q);
      } catch (t) {
        P(r);
        if (t !== t + 0) throw t;
        M(1, 0);
      }
    }
    function zd(b, c, g, d, f, h, k, l, p) {
      var q = R();
      try {
        Ne(b, c, g, d, f, h, k, l, p);
      } catch (r) {
        P(q);
        if (r !== r + 0) throw r;
        M(1, 0);
      }
    }
    function sd(b, c, g, d, f, h, k, l, p, q, r) {
      var t = R();
      try {
        Oe(b, c, g, d, f, h, k, l, p, q, r);
      } catch (A) {
        P(t);
        if (A !== A + 0) throw A;
        M(1, 0);
      }
    }
    function yd(b, c, g, d, f, h, k, l, p, q) {
      var r = R();
      try {
        Pe(b, c, g, d, f, h, k, l, p, q);
      } catch (t) {
        P(r);
        if (t !== t + 0) throw t;
        M(1, 0);
      }
    }
    function td(b, c, g, d, f, h, k, l, p, q) {
      var r = R();
      try {
        Qe(b, c, g, d, f, h, k, l, p, q);
      } catch (t) {
        P(r);
        if (t !== t + 0) throw t;
        M(1, 0);
      }
    }
    function Ad(b, c, g, d, f, h, k, l) {
      var p = R();
      try {
        Re(b, c, g, d, f, h, k, l);
      } catch (q) {
        P(p);
        if (q !== q + 0) throw q;
        M(1, 0);
      }
    }
    function wd(b, c, g, d, f, h, k, l) {
      var p = R();
      try {
        Se(b, c, g, d, f, h, k, l);
      } catch (q) {
        P(p);
        if (q !== q + 0) throw q;
        M(1, 0);
      }
    }
    function pd(b, c, g, d, f, h, k, l, p, q) {
      var r = R();
      try {
        Te(b, c, g, d, f, h, k, l, p, q);
      } catch (t) {
        P(r);
        if (t !== t + 0) throw t;
        M(1, 0);
      }
    }
    function rd(b, c, g, d, f, h, k, l) {
      var p = R();
      try {
        he(b, c, g, d, f, h, k, l);
      } catch (q) {
        P(p);
        if (q !== q + 0) throw q;
        M(1, 0);
      }
    }
    function od(b, c, g, d, f, h, k, l) {
      var p = R();
      try {
        ie(b, c, g, d, f, h, k, l);
      } catch (q) {
        P(p);
        if (q !== q + 0) throw q;
        M(1, 0);
      }
    }
    function Ic(b, c, g, d, f, h, k, l) {
      var p = R();
      try {
        return Ue(b, c, g, d, f, h, k, l);
      } catch (q) {
        P(p);
        if (q !== q + 0) throw q;
        M(1, 0);
      }
    }
    function Kd(b, c, g, d, f, h, k, l) {
      var p = R();
      try {
        Ve(b, c, g, d, f, h, k, l);
      } catch (q) {
        P(p);
        if (q !== q + 0) throw q;
        M(1, 0);
      }
    }
    function Vc(b) {
      var c = R();
      try {
        return re(b);
      } catch (g) {
        P(c);
        if (g !== g + 0) throw g;
        M(1, 0);
      }
    }
    function Xc(b, c, g) {
      var d = R();
      try {
        return Ce(b, c, g);
      } catch (f) {
        P(d);
        if (f !== f + 0) throw f;
        M(1, 0);
      }
    }
    a.addRunDependency = za;
    a.removeRunDependency = Aa;
    a.stringToAscii = mc;
    a.stringToUTF8OnStack = nc;
    a.FS_createPreloadedFile = zb;
    a.FS_unlink = b => Xb(b);
    a.FS_createPath = ec;
    a.FS_createDevice = F;
    a.FS_createDataFile = (b, c, g, d, f, h) => {
      yb(b, c, g, d, f, h);
    };
    a.FS_createLazyFile = hc;
    var Ze;
    ya = function $e() {
      Ze || af();
      Ze || (ya = $e);
    };
    function af() {
      function b() {
        if (!Ze && ((Ze = !0), (a.calledRun = !0), !oa)) {
          ua = !0;
          a.noFSInit ||
            dc ||
            ((dc = !0),
            (a.stdin = a.stdin),
            (a.stdout = a.stdout),
            (a.stderr = a.stderr),
            a.stdin ? F('/dev', 'stdin', a.stdin) : Wb('/dev/tty', '/dev/stdin'),
            a.stdout ? F('/dev', 'stdout', null, a.stdout) : Wb('/dev/tty', '/dev/stdout'),
            a.stderr ? F('/dev', 'stderr', null, a.stderr) : Wb('/dev/tty1', '/dev/stderr'),
            Zb('/dev/stdin', 0),
            Zb('/dev/stdout', 1),
            Zb('/dev/stderr', 1));
          Gb = !1;
          Ka(sa);
          aa(a);
          a.onRuntimeInitialized?.();
          if (a.postRun)
            for ('function' == typeof a.postRun && (a.postRun = [a.postRun]); a.postRun.length; ) {
              var c = a.postRun.shift();
              ta.unshift(c);
            }
          Ka(ta);
        }
      }
      if (!(0 < wa)) {
        if (a.preRun)
          for ('function' == typeof a.preRun && (a.preRun = [a.preRun]); a.preRun.length; ) va();
        Ka(ra);
        0 < wa ||
          (a.setStatus
            ? (a.setStatus('Running...'),
              setTimeout(function () {
                setTimeout(function () {
                  a.setStatus('');
                }, 1);
                b();
              }, 1))
            : b());
      }
    }
    if (a.preInit)
      for ('function' == typeof a.preInit && (a.preInit = [a.preInit]); 0 < a.preInit.length; )
        a.preInit.pop()();
    af();
    function S(b) {
      try {
        var c = R();
        return b();
      } finally {
        P(c);
      }
    }
    function T(b) {
      return b ? nc(b) : 0;
    }
    function U(b) {
      const c = L(b.length << 2);
      v.set(b, c >>> 2);
      return c;
    }
    function bf(b) {
      const c = L(b.length);
      n.set(b, c);
      return c;
    }
    function cf() {
      [
        ['none', 'None'],
        ['i32', 'Int32'],
        ['i64', 'Int64'],
        ['f32', 'Float32'],
        ['f64', 'Float64'],
        ['v128', 'Vec128'],
        ['funcref', 'Funcref'],
        ['externref', 'Externref'],
        ['anyref', 'Anyref'],
        ['eqref', 'Eqref'],
        ['i31ref', 'I31ref'],
        ['structref', 'Structref'],
        ['stringref', 'Stringref'],
        ['nullref', 'Nullref'],
        ['nullexternref', 'NullExternref'],
        ['nullfuncref', 'NullFuncref'],
        ['unreachable', 'Unreachable'],
        ['auto', 'Auto'],
      ].forEach(b => {
        a[b[0]] = a['_BinaryenType' + b[1]]();
      });
      [
        ['notPacked', 'NotPacked'],
        ['i8', 'Int8'],
        ['i16', 'Int16'],
      ].forEach(b => {
        a[b[0]] = a['_BinaryenPackedType' + b[1]]();
      });
      a.ExpressionIds = {};
      'Invalid Block If Loop Break Switch Call CallIndirect LocalGet LocalSet GlobalGet GlobalSet Load Store Const Unary Binary Select Drop Return MemorySize MemoryGrow Nop Unreachable AtomicCmpxchg AtomicRMW AtomicWait AtomicNotify AtomicFence SIMDExtract SIMDReplace SIMDShuffle SIMDTernary SIMDShift SIMDLoad SIMDLoadStoreLane MemoryInit DataDrop MemoryCopy MemoryFill RefNull RefIsNull RefFunc RefEq TableGet TableSet TableSize TableGrow Try Throw Rethrow TupleMake TupleExtract Pop RefI31 I31Get CallRef RefTest RefCast BrOn StructNew StructGet StructSet ArrayNew ArrayNewFixed ArrayNewData ArrayNewElem ArrayGet ArraySet ArrayLen ArrayFill ArrayCopy ArrayInitData ArrayInitElem RefAs StringNew StringConst StringMeasure StringEncode StringConcat StringEq StringWTF16Get StringSliceWTF'
        .split(' ')
        .forEach(b => {
          a.ExpressionIds[b] = a[b + 'Id'] = a['_Binaryen' + b + 'Id']();
        });
      a.ExternalKinds = {};
      ['Function', 'Table', 'Memory', 'Global', 'Tag'].forEach(b => {
        a.ExternalKinds[b] = a['External' + b] = a['_BinaryenExternal' + b]();
      });
      a.Features = {};
      'MVP Atomics MutableGlobals NontrappingFPToInt SIMD128 BulkMemory SignExt ExceptionHandling TailCall ReferenceTypes Multivalue GC Memory64 RelaxedSIMD ExtendedConst Strings MultiMemory StackSwitching SharedEverything FP16 BulkMemoryOpt CallIndirectOverlong All'
        .split(' ')
        .forEach(b => {
          a.Features[b] = a['_BinaryenFeature' + b]();
        });
      a.Operations = {};
      'ClzInt32 CtzInt32 PopcntInt32 NegFloat32 AbsFloat32 CeilFloat32 FloorFloat32 TruncFloat32 NearestFloat32 SqrtFloat32 EqZInt32 ClzInt64 CtzInt64 PopcntInt64 NegFloat64 AbsFloat64 CeilFloat64 FloorFloat64 TruncFloat64 NearestFloat64 SqrtFloat64 EqZInt64 ExtendSInt32 ExtendUInt32 WrapInt64 TruncSFloat32ToInt32 TruncSFloat32ToInt64 TruncUFloat32ToInt32 TruncUFloat32ToInt64 TruncSFloat64ToInt32 TruncSFloat64ToInt64 TruncUFloat64ToInt32 TruncUFloat64ToInt64 TruncSatSFloat32ToInt32 TruncSatSFloat32ToInt64 TruncSatUFloat32ToInt32 TruncSatUFloat32ToInt64 TruncSatSFloat64ToInt32 TruncSatSFloat64ToInt64 TruncSatUFloat64ToInt32 TruncSatUFloat64ToInt64 ReinterpretFloat32 ReinterpretFloat64 ConvertSInt32ToFloat32 ConvertSInt32ToFloat64 ConvertUInt32ToFloat32 ConvertUInt32ToFloat64 ConvertSInt64ToFloat32 ConvertSInt64ToFloat64 ConvertUInt64ToFloat32 ConvertUInt64ToFloat64 PromoteFloat32 DemoteFloat64 ReinterpretInt32 ReinterpretInt64 ExtendS8Int32 ExtendS16Int32 ExtendS8Int64 ExtendS16Int64 ExtendS32Int64 AddInt32 SubInt32 MulInt32 DivSInt32 DivUInt32 RemSInt32 RemUInt32 AndInt32 OrInt32 XorInt32 ShlInt32 ShrUInt32 ShrSInt32 RotLInt32 RotRInt32 EqInt32 NeInt32 LtSInt32 LtUInt32 LeSInt32 LeUInt32 GtSInt32 GtUInt32 GeSInt32 GeUInt32 AddInt64 SubInt64 MulInt64 DivSInt64 DivUInt64 RemSInt64 RemUInt64 AndInt64 OrInt64 XorInt64 ShlInt64 ShrUInt64 ShrSInt64 RotLInt64 RotRInt64 EqInt64 NeInt64 LtSInt64 LtUInt64 LeSInt64 LeUInt64 GtSInt64 GtUInt64 GeSInt64 GeUInt64 AddFloat32 SubFloat32 MulFloat32 DivFloat32 CopySignFloat32 MinFloat32 MaxFloat32 EqFloat32 NeFloat32 LtFloat32 LeFloat32 GtFloat32 GeFloat32 AddFloat64 SubFloat64 MulFloat64 DivFloat64 CopySignFloat64 MinFloat64 MaxFloat64 EqFloat64 NeFloat64 LtFloat64 LeFloat64 GtFloat64 GeFloat64 AtomicRMWAdd AtomicRMWSub AtomicRMWAnd AtomicRMWOr AtomicRMWXor AtomicRMWXchg SplatVecI8x16 ExtractLaneSVecI8x16 ExtractLaneUVecI8x16 ReplaceLaneVecI8x16 SplatVecI16x8 ExtractLaneSVecI16x8 ExtractLaneUVecI16x8 ReplaceLaneVecI16x8 SplatVecI32x4 ExtractLaneVecI32x4 ReplaceLaneVecI32x4 SplatVecI64x2 ExtractLaneVecI64x2 ReplaceLaneVecI64x2 SplatVecF32x4 ExtractLaneVecF32x4 ReplaceLaneVecF32x4 SplatVecF64x2 ExtractLaneVecF64x2 ReplaceLaneVecF64x2 EqVecI8x16 NeVecI8x16 LtSVecI8x16 LtUVecI8x16 GtSVecI8x16 GtUVecI8x16 LeSVecI8x16 LeUVecI8x16 GeSVecI8x16 GeUVecI8x16 EqVecI16x8 NeVecI16x8 LtSVecI16x8 LtUVecI16x8 GtSVecI16x8 GtUVecI16x8 LeSVecI16x8 LeUVecI16x8 GeSVecI16x8 GeUVecI16x8 EqVecI32x4 NeVecI32x4 LtSVecI32x4 LtUVecI32x4 GtSVecI32x4 GtUVecI32x4 LeSVecI32x4 LeUVecI32x4 GeSVecI32x4 GeUVecI32x4 EqVecI64x2 NeVecI64x2 LtSVecI64x2 GtSVecI64x2 LeSVecI64x2 GeSVecI64x2 EqVecF32x4 NeVecF32x4 LtVecF32x4 GtVecF32x4 LeVecF32x4 GeVecF32x4 EqVecF64x2 NeVecF64x2 LtVecF64x2 GtVecF64x2 LeVecF64x2 GeVecF64x2 NotVec128 AndVec128 OrVec128 XorVec128 AndNotVec128 BitselectVec128 RelaxedMaddVecF32x4 RelaxedNmaddVecF32x4 RelaxedMaddVecF64x2 RelaxedNmaddVecF64x2 LaneselectI8x16 LaneselectI16x8 LaneselectI32x4 LaneselectI64x2 DotI8x16I7x16AddSToVecI32x4 AnyTrueVec128 PopcntVecI8x16 AbsVecI8x16 NegVecI8x16 AllTrueVecI8x16 BitmaskVecI8x16 ShlVecI8x16 ShrSVecI8x16 ShrUVecI8x16 AddVecI8x16 AddSatSVecI8x16 AddSatUVecI8x16 SubVecI8x16 SubSatSVecI8x16 SubSatUVecI8x16 MinSVecI8x16 MinUVecI8x16 MaxSVecI8x16 MaxUVecI8x16 AvgrUVecI8x16 AbsVecI16x8 NegVecI16x8 AllTrueVecI16x8 BitmaskVecI16x8 ShlVecI16x8 ShrSVecI16x8 ShrUVecI16x8 AddVecI16x8 AddSatSVecI16x8 AddSatUVecI16x8 SubVecI16x8 SubSatSVecI16x8 SubSatUVecI16x8 MulVecI16x8 MinSVecI16x8 MinUVecI16x8 MaxSVecI16x8 MaxUVecI16x8 AvgrUVecI16x8 Q15MulrSatSVecI16x8 ExtMulLowSVecI16x8 ExtMulHighSVecI16x8 ExtMulLowUVecI16x8 ExtMulHighUVecI16x8 DotSVecI16x8ToVecI32x4 ExtMulLowSVecI32x4 ExtMulHighSVecI32x4 ExtMulLowUVecI32x4 ExtMulHighUVecI32x4 AbsVecI32x4 NegVecI32x4 AllTrueVecI32x4 BitmaskVecI32x4 ShlVecI32x4 ShrSVecI32x4 ShrUVecI32x4 AddVecI32x4 SubVecI32x4 MulVecI32x4 MinSVecI32x4 MinUVecI32x4 MaxSVecI32x4 MaxUVecI32x4 AbsVecI64x2 NegVecI64x2 AllTrueVecI64x2 BitmaskVecI64x2 ShlVecI64x2 ShrSVecI64x2 ShrUVecI64x2 AddVecI64x2 SubVecI64x2 MulVecI64x2 ExtMulLowSVecI64x2 ExtMulHighSVecI64x2 ExtMulLowUVecI64x2 ExtMulHighUVecI64x2 AbsVecF32x4 NegVecF32x4 SqrtVecF32x4 AddVecF32x4 SubVecF32x4 MulVecF32x4 DivVecF32x4 MinVecF32x4 MaxVecF32x4 PMinVecF32x4 PMaxVecF32x4 CeilVecF32x4 FloorVecF32x4 TruncVecF32x4 NearestVecF32x4 AbsVecF64x2 NegVecF64x2 SqrtVecF64x2 AddVecF64x2 SubVecF64x2 MulVecF64x2 DivVecF64x2 MinVecF64x2 MaxVecF64x2 PMinVecF64x2 PMaxVecF64x2 CeilVecF64x2 FloorVecF64x2 TruncVecF64x2 NearestVecF64x2 ExtAddPairwiseSVecI8x16ToI16x8 ExtAddPairwiseUVecI8x16ToI16x8 ExtAddPairwiseSVecI16x8ToI32x4 ExtAddPairwiseUVecI16x8ToI32x4 TruncSatSVecF32x4ToVecI32x4 TruncSatUVecF32x4ToVecI32x4 ConvertSVecI32x4ToVecF32x4 ConvertUVecI32x4ToVecF32x4 Load8SplatVec128 Load16SplatVec128 Load32SplatVec128 Load64SplatVec128 Load8x8SVec128 Load8x8UVec128 Load16x4SVec128 Load16x4UVec128 Load32x2SVec128 Load32x2UVec128 Load32ZeroVec128 Load64ZeroVec128 Load8LaneVec128 Load16LaneVec128 Load32LaneVec128 Load64LaneVec128 Store8LaneVec128 Store16LaneVec128 Store32LaneVec128 Store64LaneVec128 NarrowSVecI16x8ToVecI8x16 NarrowUVecI16x8ToVecI8x16 NarrowSVecI32x4ToVecI16x8 NarrowUVecI32x4ToVecI16x8 ExtendLowSVecI8x16ToVecI16x8 ExtendHighSVecI8x16ToVecI16x8 ExtendLowUVecI8x16ToVecI16x8 ExtendHighUVecI8x16ToVecI16x8 ExtendLowSVecI16x8ToVecI32x4 ExtendHighSVecI16x8ToVecI32x4 ExtendLowUVecI16x8ToVecI32x4 ExtendHighUVecI16x8ToVecI32x4 ExtendLowSVecI32x4ToVecI64x2 ExtendHighSVecI32x4ToVecI64x2 ExtendLowUVecI32x4ToVecI64x2 ExtendHighUVecI32x4ToVecI64x2 ConvertLowSVecI32x4ToVecF64x2 ConvertLowUVecI32x4ToVecF64x2 TruncSatZeroSVecF64x2ToVecI32x4 TruncSatZeroUVecF64x2ToVecI32x4 DemoteZeroVecF64x2ToVecF32x4 PromoteLowVecF32x4ToVecF64x2 RelaxedTruncSVecF32x4ToVecI32x4 RelaxedTruncUVecF32x4ToVecI32x4 RelaxedTruncZeroSVecF64x2ToVecI32x4 RelaxedTruncZeroUVecF64x2ToVecI32x4 SwizzleVecI8x16 RelaxedSwizzleVecI8x16 RelaxedMinVecF32x4 RelaxedMaxVecF32x4 RelaxedMinVecF64x2 RelaxedMaxVecF64x2 RelaxedQ15MulrSVecI16x8 DotI8x16I7x16SToVecI16x8 RefAsNonNull RefAsExternInternalize RefAsExternExternalize RefAsAnyConvertExtern RefAsExternConvertAny BrOnNull BrOnNonNull BrOnCast BrOnCastFail StringNewLossyUTF8Array StringNewWTF16Array StringNewFromCodePoint StringMeasureUTF8 StringMeasureWTF16 StringEncodeLossyUTF8Array StringEncodeWTF16Array StringEqEqual StringEqCompare'
        .split(' ')
        .forEach(b => {
          a.Operations[b] = a[b] = a['_Binaryen' + b]();
        });
      a.SideEffects = {};
      'None Branches Calls ReadsLocal WritesLocal ReadsGlobal WritesGlobal ReadsMemory WritesMemory ReadsTable WritesTable ImplicitTrap IsAtomic Throws DanglingPop TrapsNeverHappen Any'
        .split(' ')
        .forEach(b => {
          a.SideEffects[b] = a['_BinaryenSideEffect' + b]();
        });
      a.ExpressionRunner.Flags = {
        Default: a._ExpressionRunnerFlagsDefault(),
        PreserveSideeffects: a._ExpressionRunnerFlagsPreserveSideeffects(),
      };
    }
    a.Module = function (b) {
      !b || x();
      df(a._BinaryenModuleCreate(), this);
    };
    function df(b, c = {}) {
      b || x();
      c.ptr = b;
      const g = Ud();
      c.block = function (d, f, h) {
        return S(() =>
          a._BinaryenBlock(b, d ? T(d) : 0, U(f), f.length, 'undefined' !== typeof h ? h : a.none)
        );
      };
      c['if'] = function (d, f, h) {
        return a._BinaryenIf(b, d, f, h);
      };
      c.loop = function (d, f) {
        return S(() => a._BinaryenLoop(b, T(d), f));
      };
      c['break'] = c.br = function (d, f, h) {
        return S(() => a._BinaryenBreak(b, T(d), f, h));
      };
      c.br_if = function (d, f, h) {
        return c.br(d, f, h);
      };
      c['switch'] = function (d, f, h, k) {
        return S(() => a._BinaryenSwitch(b, U(d.map(T)), d.length, T(f), h, k));
      };
      c.call = function (d, f, h) {
        return S(() => a._BinaryenCall(b, T(d), U(f), f.length, h));
      };
      c.callIndirect = c.call_indirect = function (d, f, h, k, l) {
        return S(() => a._BinaryenCallIndirect(b, T(d), f, U(h), h.length, k, l));
      };
      c.returnCall = c.return_call = function (d, f, h) {
        return S(() => a._BinaryenReturnCall(b, T(d), U(f), f.length, h));
      };
      c.returnCallIndirect = c.return_call_indirect = function (d, f, h, k, l) {
        return S(() => a._BinaryenReturnCallIndirect(b, T(d), f, U(h), h.length, k, l));
      };
      c.local = {
        get: function (d, f) {
          return a._BinaryenLocalGet(b, d, f);
        },
        set: function (d, f) {
          return a._BinaryenLocalSet(b, d, f);
        },
        tee: function (d, f, h) {
          if ('undefined' === typeof h) throw Error("local.tee's type should be defined");
          return a._BinaryenLocalTee(b, d, f, h);
        },
      };
      c.global = {
        get: function (d, f) {
          return S(() => a._BinaryenGlobalGet(b, T(d), f));
        },
        set: function (d, f) {
          return S(() => a._BinaryenGlobalSet(b, T(d), f));
        },
      };
      c.table = {
        get: function (d, f, h) {
          return S(() => a._BinaryenTableGet(b, T(d), f, h));
        },
        set: function (d, f, h) {
          return S(() => a._BinaryenTableSet(b, T(d), f, h));
        },
        size: function (d) {
          return S(() => a._BinaryenTableSize(b, T(d)));
        },
        grow: function (d, f, h) {
          return S(() => a._BinaryenTableGrow(b, T(d), f, h));
        },
      };
      c.memory = {
        size: function (d, f) {
          return S(() => a._BinaryenMemorySize(b, T(d), f));
        },
        grow: function (d, f, h) {
          return S(() => a._BinaryenMemoryGrow(b, d, T(f), h));
        },
        init: function (d, f, h, k, l) {
          return S(() => a._BinaryenMemoryInit(b, T(d), f, h, k, T(l)));
        },
        copy: function (d, f, h, k, l) {
          return S(() => a._BinaryenMemoryCopy(b, d, f, h, T(k), T(l)));
        },
        fill: function (d, f, h, k) {
          return S(() => a._BinaryenMemoryFill(b, d, f, h, T(k)));
        },
        atomic: {
          notify: function (d, f, h) {
            return S(() => a._BinaryenAtomicNotify(b, d, f, T(h)));
          },
          wait32: function (d, f, h, k) {
            return S(() => a._BinaryenAtomicWait(b, d, f, h, a.i32, T(k)));
          },
          wait64: function (d, f, h, k) {
            return S(() => a._BinaryenAtomicWait(b, d, f, h, a.i64, T(k)));
          },
        },
      };
      c.data = {
        drop: function (d) {
          return S(() => a._BinaryenDataDrop(b, T(d)));
        },
      };
      c.i32 = {
        load: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 4, !0, d, f, a.i32, h, T(k)));
        },
        load8_s: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 1, !0, d, f, a.i32, h, T(k)));
        },
        load8_u: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 1, !1, d, f, a.i32, h, T(k)));
        },
        load16_s: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 2, !0, d, f, a.i32, h, T(k)));
        },
        load16_u: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 2, !1, d, f, a.i32, h, T(k)));
        },
        store: function (d, f, h, k, l) {
          return S(() => a._BinaryenStore(b, 4, d, f, h, k, a.i32, T(l)));
        },
        store8: function (d, f, h, k, l) {
          return S(() => a._BinaryenStore(b, 1, d, f, h, k, a.i32, T(l)));
        },
        store16: function (d, f, h, k, l) {
          return S(() => a._BinaryenStore(b, 2, d, f, h, k, a.i32, T(l)));
        },
        ['const'](d) {
          return S(() => {
            const f = L(g);
            a._BinaryenLiteralInt32(f, d);
            return a._BinaryenConst(b, f);
          });
        },
        clz: function (d) {
          return a._BinaryenUnary(b, a.ClzInt32, d);
        },
        ctz: function (d) {
          return a._BinaryenUnary(b, a.CtzInt32, d);
        },
        popcnt: function (d) {
          return a._BinaryenUnary(b, a.PopcntInt32, d);
        },
        eqz: function (d) {
          return a._BinaryenUnary(b, a.EqZInt32, d);
        },
        trunc_s: {
          f32: function (d) {
            return a._BinaryenUnary(b, a.TruncSFloat32ToInt32, d);
          },
          f64: function (d) {
            return a._BinaryenUnary(b, a.TruncSFloat64ToInt32, d);
          },
        },
        trunc_u: {
          f32: function (d) {
            return a._BinaryenUnary(b, a.TruncUFloat32ToInt32, d);
          },
          f64: function (d) {
            return a._BinaryenUnary(b, a.TruncUFloat64ToInt32, d);
          },
        },
        trunc_s_sat: {
          f32: function (d) {
            return a._BinaryenUnary(b, a.TruncSatSFloat32ToInt32, d);
          },
          f64: function (d) {
            return a._BinaryenUnary(b, a.TruncSatSFloat64ToInt32, d);
          },
        },
        trunc_u_sat: {
          f32: function (d) {
            return a._BinaryenUnary(b, a.TruncSatUFloat32ToInt32, d);
          },
          f64: function (d) {
            return a._BinaryenUnary(b, a.TruncSatUFloat64ToInt32, d);
          },
        },
        reinterpret: function (d) {
          return a._BinaryenUnary(b, a.ReinterpretFloat32, d);
        },
        extend8_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendS8Int32, d);
        },
        extend16_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendS16Int32, d);
        },
        wrap: function (d) {
          return a._BinaryenUnary(b, a.WrapInt64, d);
        },
        add: function (d, f) {
          return a._BinaryenBinary(b, a.AddInt32, d, f);
        },
        sub: function (d, f) {
          return a._BinaryenBinary(b, a.SubInt32, d, f);
        },
        mul: function (d, f) {
          return a._BinaryenBinary(b, a.MulInt32, d, f);
        },
        div_s: function (d, f) {
          return a._BinaryenBinary(b, a.DivSInt32, d, f);
        },
        div_u: function (d, f) {
          return a._BinaryenBinary(b, a.DivUInt32, d, f);
        },
        rem_s: function (d, f) {
          return a._BinaryenBinary(b, a.RemSInt32, d, f);
        },
        rem_u: function (d, f) {
          return a._BinaryenBinary(b, a.RemUInt32, d, f);
        },
        and: function (d, f) {
          return a._BinaryenBinary(b, a.AndInt32, d, f);
        },
        or: function (d, f) {
          return a._BinaryenBinary(b, a.OrInt32, d, f);
        },
        xor: function (d, f) {
          return a._BinaryenBinary(b, a.XorInt32, d, f);
        },
        shl: function (d, f) {
          return a._BinaryenBinary(b, a.ShlInt32, d, f);
        },
        shr_u: function (d, f) {
          return a._BinaryenBinary(b, a.ShrUInt32, d, f);
        },
        shr_s: function (d, f) {
          return a._BinaryenBinary(b, a.ShrSInt32, d, f);
        },
        rotl: function (d, f) {
          return a._BinaryenBinary(b, a.RotLInt32, d, f);
        },
        rotr: function (d, f) {
          return a._BinaryenBinary(b, a.RotRInt32, d, f);
        },
        eq: function (d, f) {
          return a._BinaryenBinary(b, a.EqInt32, d, f);
        },
        ne: function (d, f) {
          return a._BinaryenBinary(b, a.NeInt32, d, f);
        },
        lt_s: function (d, f) {
          return a._BinaryenBinary(b, a.LtSInt32, d, f);
        },
        lt_u: function (d, f) {
          return a._BinaryenBinary(b, a.LtUInt32, d, f);
        },
        le_s: function (d, f) {
          return a._BinaryenBinary(b, a.LeSInt32, d, f);
        },
        le_u: function (d, f) {
          return a._BinaryenBinary(b, a.LeUInt32, d, f);
        },
        gt_s: function (d, f) {
          return a._BinaryenBinary(b, a.GtSInt32, d, f);
        },
        gt_u: function (d, f) {
          return a._BinaryenBinary(b, a.GtUInt32, d, f);
        },
        ge_s: function (d, f) {
          return a._BinaryenBinary(b, a.GeSInt32, d, f);
        },
        ge_u: function (d, f) {
          return a._BinaryenBinary(b, a.GeUInt32, d, f);
        },
        atomic: {
          load: function (d, f, h) {
            return S(() => a._BinaryenAtomicLoad(b, 4, d, a.i32, f, T(h)));
          },
          load8_u: function (d, f, h) {
            return S(() => a._BinaryenAtomicLoad(b, 1, d, a.i32, f, T(h)));
          },
          load16_u: function (d, f, h) {
            return S(() => a._BinaryenAtomicLoad(b, 2, d, a.i32, f, T(h)));
          },
          store: function (d, f, h, k) {
            return S(() => a._BinaryenAtomicStore(b, 4, d, f, h, a.i32, T(k)));
          },
          store8: function (d, f, h, k) {
            return S(() => a._BinaryenAtomicStore(b, 1, d, f, h, a.i32, T(k)));
          },
          store16: function (d, f, h, k) {
            return S(() => a._BinaryenAtomicStore(b, 2, d, f, h, a.i32, T(k)));
          },
          rmw: {
            add: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAdd, 4, d, f, h, a.i32, T(k)));
            },
            sub: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWSub, 4, d, f, h, a.i32, T(k)));
            },
            and: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAnd, 4, d, f, h, a.i32, T(k)));
            },
            or: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWOr, 4, d, f, h, a.i32, T(k)));
            },
            xor: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXor, 4, d, f, h, a.i32, T(k)));
            },
            xchg: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXchg, 4, d, f, h, a.i32, T(k)));
            },
            cmpxchg: function (d, f, h, k, l) {
              return S(() => a._BinaryenAtomicCmpxchg(b, 4, d, f, h, k, a.i32, T(l)));
            },
          },
          rmw8_u: {
            add: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAdd, 1, d, f, h, a.i32, T(k)));
            },
            sub: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWSub, 1, d, f, h, a.i32, T(k)));
            },
            and: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAnd, 1, d, f, h, a.i32, T(k)));
            },
            or: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWOr, 1, d, f, h, a.i32, T(k)));
            },
            xor: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXor, 1, d, f, h, a.i32, T(k)));
            },
            xchg: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXchg, 1, d, f, h, a.i32, T(k)));
            },
            cmpxchg: function (d, f, h, k, l) {
              return S(() => a._BinaryenAtomicCmpxchg(b, 1, d, f, h, k, a.i32, T(l)));
            },
          },
          rmw16_u: {
            add: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAdd, 2, d, f, h, a.i32, T(k)));
            },
            sub: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWSub, 2, d, f, h, a.i32, T(k)));
            },
            and: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAnd, 2, d, f, h, a.i32, T(k)));
            },
            or: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWOr, 2, d, f, h, a.i32, T(k)));
            },
            xor: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXor, 2, d, f, h, a.i32, T(k)));
            },
            xchg: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXchg, 2, d, f, h, a.i32, T(k)));
            },
            cmpxchg: function (d, f, h, k, l) {
              return S(() => a._BinaryenAtomicCmpxchg(b, 2, d, f, h, k, a.i32, T(l)));
            },
          },
        },
        pop: function () {
          return a._BinaryenPop(b, a.i32);
        },
      };
      c.i64 = {
        load: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 8, !0, d, f, a.i64, h, T(k)));
        },
        load8_s: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 1, !0, d, f, a.i64, h, T(k)));
        },
        load8_u: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 1, !1, d, f, a.i64, h, T(k)));
        },
        load16_s: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 2, !0, d, f, a.i64, h, T(k)));
        },
        load16_u: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 2, !1, d, f, a.i64, h, T(k)));
        },
        load32_s: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 4, !0, d, f, a.i64, h, T(k)));
        },
        load32_u: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 4, !1, d, f, a.i64, h, T(k)));
        },
        store: function (d, f, h, k, l) {
          return S(() => a._BinaryenStore(b, 8, d, f, h, k, a.i64, T(l)));
        },
        store8: function (d, f, h, k, l) {
          return S(() => a._BinaryenStore(b, 1, d, f, h, k, a.i64, T(l)));
        },
        store16: function (d, f, h, k, l) {
          return S(() => a._BinaryenStore(b, 2, d, f, h, k, a.i64, T(l)));
        },
        store32: function (d, f, h, k, l) {
          return S(() => a._BinaryenStore(b, 4, d, f, h, k, a.i64, T(l)));
        },
        ['const'](d, f) {
          return S(() => {
            const h = L(g);
            a._BinaryenLiteralInt64(h, d, f);
            return a._BinaryenConst(b, h);
          });
        },
        clz: function (d) {
          return a._BinaryenUnary(b, a.ClzInt64, d);
        },
        ctz: function (d) {
          return a._BinaryenUnary(b, a.CtzInt64, d);
        },
        popcnt: function (d) {
          return a._BinaryenUnary(b, a.PopcntInt64, d);
        },
        eqz: function (d) {
          return a._BinaryenUnary(b, a.EqZInt64, d);
        },
        trunc_s: {
          f32: function (d) {
            return a._BinaryenUnary(b, a.TruncSFloat32ToInt64, d);
          },
          f64: function (d) {
            return a._BinaryenUnary(b, a.TruncSFloat64ToInt64, d);
          },
        },
        trunc_u: {
          f32: function (d) {
            return a._BinaryenUnary(b, a.TruncUFloat32ToInt64, d);
          },
          f64: function (d) {
            return a._BinaryenUnary(b, a.TruncUFloat64ToInt64, d);
          },
        },
        trunc_s_sat: {
          f32: function (d) {
            return a._BinaryenUnary(b, a.TruncSatSFloat32ToInt64, d);
          },
          f64: function (d) {
            return a._BinaryenUnary(b, a.TruncSatSFloat64ToInt64, d);
          },
        },
        trunc_u_sat: {
          f32: function (d) {
            return a._BinaryenUnary(b, a.TruncSatUFloat32ToInt64, d);
          },
          f64: function (d) {
            return a._BinaryenUnary(b, a.TruncSatUFloat64ToInt64, d);
          },
        },
        reinterpret: function (d) {
          return a._BinaryenUnary(b, a.ReinterpretFloat64, d);
        },
        extend8_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendS8Int64, d);
        },
        extend16_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendS16Int64, d);
        },
        extend32_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendS32Int64, d);
        },
        extend_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendSInt32, d);
        },
        extend_u: function (d) {
          return a._BinaryenUnary(b, a.ExtendUInt32, d);
        },
        add: function (d, f) {
          return a._BinaryenBinary(b, a.AddInt64, d, f);
        },
        sub: function (d, f) {
          return a._BinaryenBinary(b, a.SubInt64, d, f);
        },
        mul: function (d, f) {
          return a._BinaryenBinary(b, a.MulInt64, d, f);
        },
        div_s: function (d, f) {
          return a._BinaryenBinary(b, a.DivSInt64, d, f);
        },
        div_u: function (d, f) {
          return a._BinaryenBinary(b, a.DivUInt64, d, f);
        },
        rem_s: function (d, f) {
          return a._BinaryenBinary(b, a.RemSInt64, d, f);
        },
        rem_u: function (d, f) {
          return a._BinaryenBinary(b, a.RemUInt64, d, f);
        },
        and: function (d, f) {
          return a._BinaryenBinary(b, a.AndInt64, d, f);
        },
        or: function (d, f) {
          return a._BinaryenBinary(b, a.OrInt64, d, f);
        },
        xor: function (d, f) {
          return a._BinaryenBinary(b, a.XorInt64, d, f);
        },
        shl: function (d, f) {
          return a._BinaryenBinary(b, a.ShlInt64, d, f);
        },
        shr_u: function (d, f) {
          return a._BinaryenBinary(b, a.ShrUInt64, d, f);
        },
        shr_s: function (d, f) {
          return a._BinaryenBinary(b, a.ShrSInt64, d, f);
        },
        rotl: function (d, f) {
          return a._BinaryenBinary(b, a.RotLInt64, d, f);
        },
        rotr: function (d, f) {
          return a._BinaryenBinary(b, a.RotRInt64, d, f);
        },
        eq: function (d, f) {
          return a._BinaryenBinary(b, a.EqInt64, d, f);
        },
        ne: function (d, f) {
          return a._BinaryenBinary(b, a.NeInt64, d, f);
        },
        lt_s: function (d, f) {
          return a._BinaryenBinary(b, a.LtSInt64, d, f);
        },
        lt_u: function (d, f) {
          return a._BinaryenBinary(b, a.LtUInt64, d, f);
        },
        le_s: function (d, f) {
          return a._BinaryenBinary(b, a.LeSInt64, d, f);
        },
        le_u: function (d, f) {
          return a._BinaryenBinary(b, a.LeUInt64, d, f);
        },
        gt_s: function (d, f) {
          return a._BinaryenBinary(b, a.GtSInt64, d, f);
        },
        gt_u: function (d, f) {
          return a._BinaryenBinary(b, a.GtUInt64, d, f);
        },
        ge_s: function (d, f) {
          return a._BinaryenBinary(b, a.GeSInt64, d, f);
        },
        ge_u: function (d, f) {
          return a._BinaryenBinary(b, a.GeUInt64, d, f);
        },
        atomic: {
          load: function (d, f, h) {
            return S(() => a._BinaryenAtomicLoad(b, 8, d, a.i64, f, T(h)));
          },
          load8_u: function (d, f, h) {
            return S(() => a._BinaryenAtomicLoad(b, 1, d, a.i64, f, T(h)));
          },
          load16_u: function (d, f, h) {
            return S(() => a._BinaryenAtomicLoad(b, 2, d, a.i64, f, T(h)));
          },
          load32_u: function (d, f, h) {
            return S(() => a._BinaryenAtomicLoad(b, 4, d, a.i64, f, T(h)));
          },
          store: function (d, f, h, k) {
            return S(() => a._BinaryenAtomicStore(b, 8, d, f, h, a.i64, T(k)));
          },
          store8: function (d, f, h, k) {
            return S(() => a._BinaryenAtomicStore(b, 1, d, f, h, a.i64, T(k)));
          },
          store16: function (d, f, h, k) {
            return S(() => a._BinaryenAtomicStore(b, 2, d, f, h, a.i64, T(k)));
          },
          store32: function (d, f, h, k) {
            return S(() => a._BinaryenAtomicStore(b, 4, d, f, h, a.i64, T(k)));
          },
          rmw: {
            add: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAdd, 8, d, f, h, a.i64, T(k)));
            },
            sub: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWSub, 8, d, f, h, a.i64, T(k)));
            },
            and: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAnd, 8, d, f, h, a.i64, T(k)));
            },
            or: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWOr, 8, d, f, h, a.i64, T(k)));
            },
            xor: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXor, 8, d, f, h, a.i64, T(k)));
            },
            xchg: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXchg, 8, d, f, h, a.i64, T(k)));
            },
            cmpxchg: function (d, f, h, k, l) {
              return S(() => a._BinaryenAtomicCmpxchg(b, 8, d, f, h, k, a.i64, T(l)));
            },
          },
          rmw8_u: {
            add: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAdd, 1, d, f, h, a.i64, T(k)));
            },
            sub: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWSub, 1, d, f, h, a.i64, T(k)));
            },
            and: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAnd, 1, d, f, h, a.i64, T(k)));
            },
            or: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWOr, 1, d, f, h, a.i64, T(k)));
            },
            xor: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXor, 1, d, f, h, a.i64, T(k)));
            },
            xchg: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXchg, 1, d, f, h, a.i64, T(k)));
            },
            cmpxchg: function (d, f, h, k, l) {
              return S(() => a._BinaryenAtomicCmpxchg(b, 1, d, f, h, k, a.i64, T(l)));
            },
          },
          rmw16_u: {
            add: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAdd, 2, d, f, h, a.i64, T(k)));
            },
            sub: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWSub, 2, d, f, h, a.i64, T(k)));
            },
            and: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAnd, 2, d, f, h, a.i64, T(k)));
            },
            or: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWOr, 2, d, f, h, a.i64, T(k)));
            },
            xor: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXor, 2, d, f, h, a.i64, T(k)));
            },
            xchg: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXchg, 2, d, f, h, a.i64, T(k)));
            },
            cmpxchg: function (d, f, h, k, l) {
              return S(() => a._BinaryenAtomicCmpxchg(b, 2, d, f, h, k, a.i64, T(l)));
            },
          },
          rmw32_u: {
            add: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAdd, 4, d, f, h, a.i64, T(k)));
            },
            sub: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWSub, 4, d, f, h, a.i64, T(k)));
            },
            and: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWAnd, 4, d, f, h, a.i64, T(k)));
            },
            or: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWOr, 4, d, f, h, a.i64, T(k)));
            },
            xor: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXor, 4, d, f, h, a.i64, T(k)));
            },
            xchg: function (d, f, h, k) {
              return S(() => a._BinaryenAtomicRMW(b, a.AtomicRMWXchg, 4, d, f, h, a.i64, T(k)));
            },
            cmpxchg: function (d, f, h, k, l) {
              return S(() => a._BinaryenAtomicCmpxchg(b, 4, d, f, h, k, a.i64, T(l)));
            },
          },
        },
        pop: function () {
          return a._BinaryenPop(b, a.i64);
        },
      };
      c.f32 = {
        load: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 4, !0, d, f, a.f32, h, T(k)));
        },
        store: function (d, f, h, k, l) {
          return S(() => a._BinaryenStore(b, 4, d, f, h, k, a.f32, T(l)));
        },
        ['const'](d) {
          return S(() => {
            const f = L(g);
            a._BinaryenLiteralFloat32(f, d);
            return a._BinaryenConst(b, f);
          });
        },
        const_bits: function (d) {
          return S(() => {
            const f = L(g);
            a._BinaryenLiteralFloat32Bits(f, d);
            return a._BinaryenConst(b, f);
          });
        },
        neg: function (d) {
          return a._BinaryenUnary(b, a.NegFloat32, d);
        },
        abs: function (d) {
          return a._BinaryenUnary(b, a.AbsFloat32, d);
        },
        ceil: function (d) {
          return a._BinaryenUnary(b, a.CeilFloat32, d);
        },
        floor: function (d) {
          return a._BinaryenUnary(b, a.FloorFloat32, d);
        },
        trunc: function (d) {
          return a._BinaryenUnary(b, a.TruncFloat32, d);
        },
        nearest: function (d) {
          return a._BinaryenUnary(b, a.NearestFloat32, d);
        },
        sqrt: function (d) {
          return a._BinaryenUnary(b, a.SqrtFloat32, d);
        },
        reinterpret: function (d) {
          return a._BinaryenUnary(b, a.ReinterpretInt32, d);
        },
        convert_s: {
          i32: function (d) {
            return a._BinaryenUnary(b, a.ConvertSInt32ToFloat32, d);
          },
          i64: function (d) {
            return a._BinaryenUnary(b, a.ConvertSInt64ToFloat32, d);
          },
        },
        convert_u: {
          i32: function (d) {
            return a._BinaryenUnary(b, a.ConvertUInt32ToFloat32, d);
          },
          i64: function (d) {
            return a._BinaryenUnary(b, a.ConvertUInt64ToFloat32, d);
          },
        },
        demote: function (d) {
          return a._BinaryenUnary(b, a.DemoteFloat64, d);
        },
        add: function (d, f) {
          return a._BinaryenBinary(b, a.AddFloat32, d, f);
        },
        sub: function (d, f) {
          return a._BinaryenBinary(b, a.SubFloat32, d, f);
        },
        mul: function (d, f) {
          return a._BinaryenBinary(b, a.MulFloat32, d, f);
        },
        div: function (d, f) {
          return a._BinaryenBinary(b, a.DivFloat32, d, f);
        },
        copysign: function (d, f) {
          return a._BinaryenBinary(b, a.CopySignFloat32, d, f);
        },
        min: function (d, f) {
          return a._BinaryenBinary(b, a.MinFloat32, d, f);
        },
        max: function (d, f) {
          return a._BinaryenBinary(b, a.MaxFloat32, d, f);
        },
        eq: function (d, f) {
          return a._BinaryenBinary(b, a.EqFloat32, d, f);
        },
        ne: function (d, f) {
          return a._BinaryenBinary(b, a.NeFloat32, d, f);
        },
        lt: function (d, f) {
          return a._BinaryenBinary(b, a.LtFloat32, d, f);
        },
        le: function (d, f) {
          return a._BinaryenBinary(b, a.LeFloat32, d, f);
        },
        gt: function (d, f) {
          return a._BinaryenBinary(b, a.GtFloat32, d, f);
        },
        ge: function (d, f) {
          return a._BinaryenBinary(b, a.GeFloat32, d, f);
        },
        pop: function () {
          return a._BinaryenPop(b, a.f32);
        },
      };
      c.f64 = {
        load: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 8, !0, d, f, a.f64, h, T(k)));
        },
        store: function (d, f, h, k, l) {
          return S(() => a._BinaryenStore(b, 8, d, f, h, k, a.f64, T(l)));
        },
        ['const'](d) {
          return S(() => {
            const f = L(g);
            a._BinaryenLiteralFloat64(f, d);
            return a._BinaryenConst(b, f);
          });
        },
        const_bits: function (d, f) {
          return S(() => {
            const h = L(g);
            a._BinaryenLiteralFloat64Bits(h, d, f);
            return a._BinaryenConst(b, h);
          });
        },
        neg: function (d) {
          return a._BinaryenUnary(b, a.NegFloat64, d);
        },
        abs: function (d) {
          return a._BinaryenUnary(b, a.AbsFloat64, d);
        },
        ceil: function (d) {
          return a._BinaryenUnary(b, a.CeilFloat64, d);
        },
        floor: function (d) {
          return a._BinaryenUnary(b, a.FloorFloat64, d);
        },
        trunc: function (d) {
          return a._BinaryenUnary(b, a.TruncFloat64, d);
        },
        nearest: function (d) {
          return a._BinaryenUnary(b, a.NearestFloat64, d);
        },
        sqrt: function (d) {
          return a._BinaryenUnary(b, a.SqrtFloat64, d);
        },
        reinterpret: function (d) {
          return a._BinaryenUnary(b, a.ReinterpretInt64, d);
        },
        convert_s: {
          i32: function (d) {
            return a._BinaryenUnary(b, a.ConvertSInt32ToFloat64, d);
          },
          i64: function (d) {
            return a._BinaryenUnary(b, a.ConvertSInt64ToFloat64, d);
          },
        },
        convert_u: {
          i32: function (d) {
            return a._BinaryenUnary(b, a.ConvertUInt32ToFloat64, d);
          },
          i64: function (d) {
            return a._BinaryenUnary(b, a.ConvertUInt64ToFloat64, d);
          },
        },
        promote: function (d) {
          return a._BinaryenUnary(b, a.PromoteFloat32, d);
        },
        add: function (d, f) {
          return a._BinaryenBinary(b, a.AddFloat64, d, f);
        },
        sub: function (d, f) {
          return a._BinaryenBinary(b, a.SubFloat64, d, f);
        },
        mul: function (d, f) {
          return a._BinaryenBinary(b, a.MulFloat64, d, f);
        },
        div: function (d, f) {
          return a._BinaryenBinary(b, a.DivFloat64, d, f);
        },
        copysign: function (d, f) {
          return a._BinaryenBinary(b, a.CopySignFloat64, d, f);
        },
        min: function (d, f) {
          return a._BinaryenBinary(b, a.MinFloat64, d, f);
        },
        max: function (d, f) {
          return a._BinaryenBinary(b, a.MaxFloat64, d, f);
        },
        eq: function (d, f) {
          return a._BinaryenBinary(b, a.EqFloat64, d, f);
        },
        ne: function (d, f) {
          return a._BinaryenBinary(b, a.NeFloat64, d, f);
        },
        lt: function (d, f) {
          return a._BinaryenBinary(b, a.LtFloat64, d, f);
        },
        le: function (d, f) {
          return a._BinaryenBinary(b, a.LeFloat64, d, f);
        },
        gt: function (d, f) {
          return a._BinaryenBinary(b, a.GtFloat64, d, f);
        },
        ge: function (d, f) {
          return a._BinaryenBinary(b, a.GeFloat64, d, f);
        },
        pop: function () {
          return a._BinaryenPop(b, a.f64);
        },
      };
      c.v128 = {
        load: function (d, f, h, k) {
          return S(() => a._BinaryenLoad(b, 16, !1, d, f, a.v128, h, T(k)));
        },
        load8_splat: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load8SplatVec128, d, f, h, T(k)));
        },
        load16_splat: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load16SplatVec128, d, f, h, T(k)));
        },
        load32_splat: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load32SplatVec128, d, f, h, T(k)));
        },
        load64_splat: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load64SplatVec128, d, f, h, T(k)));
        },
        load8x8_s: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load8x8SVec128, d, f, h, T(k)));
        },
        load8x8_u: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load8x8UVec128, d, f, h, T(k)));
        },
        load16x4_s: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load16x4SVec128, d, f, h, T(k)));
        },
        load16x4_u: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load16x4UVec128, d, f, h, T(k)));
        },
        load32x2_s: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load32x2SVec128, d, f, h, T(k)));
        },
        load32x2_u: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load32x2UVec128, d, f, h, T(k)));
        },
        load32_zero: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load32ZeroVec128, d, f, h, T(k)));
        },
        load64_zero: function (d, f, h, k) {
          return S(() => a._BinaryenSIMDLoad(b, a.Load64ZeroVec128, d, f, h, T(k)));
        },
        load8_lane: function (d, f, h, k, l, p) {
          return S(() => a._BinaryenSIMDLoadStoreLane(b, a.Load8LaneVec128, d, f, h, k, l, T(p)));
        },
        load16_lane: function (d, f, h, k, l, p) {
          return S(() => a._BinaryenSIMDLoadStoreLane(b, a.Load16LaneVec128, d, f, h, k, l, T(p)));
        },
        load32_lane: function (d, f, h, k, l, p) {
          return S(() => a._BinaryenSIMDLoadStoreLane(b, a.Load32LaneVec128, d, f, h, k, l, T(p)));
        },
        load64_lane: function (d, f, h, k, l, p) {
          return S(() => a._BinaryenSIMDLoadStoreLane(b, a.Load64LaneVec128, d, f, h, k, l, T(p)));
        },
        store8_lane: function (d, f, h, k, l, p) {
          return S(() => a._BinaryenSIMDLoadStoreLane(b, a.Store8LaneVec128, d, f, h, k, l, T(p)));
        },
        store16_lane: function (d, f, h, k, l, p) {
          return S(() => a._BinaryenSIMDLoadStoreLane(b, a.Store16LaneVec128, d, f, h, k, l, T(p)));
        },
        store32_lane: function (d, f, h, k, l, p) {
          return S(() => a._BinaryenSIMDLoadStoreLane(b, a.Store32LaneVec128, d, f, h, k, l, T(p)));
        },
        store64_lane: function (d, f, h, k, l, p) {
          return S(() => a._BinaryenSIMDLoadStoreLane(b, a.Store64LaneVec128, d, f, h, k, l, T(p)));
        },
        store: function (d, f, h, k, l) {
          return S(() => a._BinaryenStore(b, 16, d, f, h, k, a.v128, T(l)));
        },
        ['const'](d) {
          return S(() => {
            const f = L(g);
            a._BinaryenLiteralVec128(f, bf(d));
            return a._BinaryenConst(b, f);
          });
        },
        not: function (d) {
          return a._BinaryenUnary(b, a.NotVec128, d);
        },
        any_true: function (d) {
          return a._BinaryenUnary(b, a.AnyTrueVec128, d);
        },
        and: function (d, f) {
          return a._BinaryenBinary(b, a.AndVec128, d, f);
        },
        or: function (d, f) {
          return a._BinaryenBinary(b, a.OrVec128, d, f);
        },
        xor: function (d, f) {
          return a._BinaryenBinary(b, a.XorVec128, d, f);
        },
        andnot: function (d, f) {
          return a._BinaryenBinary(b, a.AndNotVec128, d, f);
        },
        bitselect: function (d, f, h) {
          return a._BinaryenSIMDTernary(b, a.BitselectVec128, d, f, h);
        },
        pop: function () {
          return a._BinaryenPop(b, a.v128);
        },
      };
      c.i8x16 = {
        shuffle: function (d, f, h) {
          return S(() => a._BinaryenSIMDShuffle(b, d, f, bf(h)));
        },
        swizzle: function (d, f) {
          return a._BinaryenBinary(b, a.SwizzleVecI8x16, d, f);
        },
        splat: function (d) {
          return a._BinaryenUnary(b, a.SplatVecI8x16, d);
        },
        extract_lane_s: function (d, f) {
          return a._BinaryenSIMDExtract(b, a.ExtractLaneSVecI8x16, d, f);
        },
        extract_lane_u: function (d, f) {
          return a._BinaryenSIMDExtract(b, a.ExtractLaneUVecI8x16, d, f);
        },
        replace_lane: function (d, f, h) {
          return a._BinaryenSIMDReplace(b, a.ReplaceLaneVecI8x16, d, f, h);
        },
        eq: function (d, f) {
          return a._BinaryenBinary(b, a.EqVecI8x16, d, f);
        },
        ne: function (d, f) {
          return a._BinaryenBinary(b, a.NeVecI8x16, d, f);
        },
        lt_s: function (d, f) {
          return a._BinaryenBinary(b, a.LtSVecI8x16, d, f);
        },
        lt_u: function (d, f) {
          return a._BinaryenBinary(b, a.LtUVecI8x16, d, f);
        },
        gt_s: function (d, f) {
          return a._BinaryenBinary(b, a.GtSVecI8x16, d, f);
        },
        gt_u: function (d, f) {
          return a._BinaryenBinary(b, a.GtUVecI8x16, d, f);
        },
        le_s: function (d, f) {
          return a._BinaryenBinary(b, a.LeSVecI8x16, d, f);
        },
        le_u: function (d, f) {
          return a._BinaryenBinary(b, a.LeUVecI8x16, d, f);
        },
        ge_s: function (d, f) {
          return a._BinaryenBinary(b, a.GeSVecI8x16, d, f);
        },
        ge_u: function (d, f) {
          return a._BinaryenBinary(b, a.GeUVecI8x16, d, f);
        },
        abs: function (d) {
          return a._BinaryenUnary(b, a.AbsVecI8x16, d);
        },
        neg: function (d) {
          return a._BinaryenUnary(b, a.NegVecI8x16, d);
        },
        all_true: function (d) {
          return a._BinaryenUnary(b, a.AllTrueVecI8x16, d);
        },
        bitmask: function (d) {
          return a._BinaryenUnary(b, a.BitmaskVecI8x16, d);
        },
        popcnt: function (d) {
          return a._BinaryenUnary(b, a.PopcntVecI8x16, d);
        },
        shl: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShlVecI8x16, d, f);
        },
        shr_s: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShrSVecI8x16, d, f);
        },
        shr_u: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShrUVecI8x16, d, f);
        },
        add: function (d, f) {
          return a._BinaryenBinary(b, a.AddVecI8x16, d, f);
        },
        add_saturate_s: function (d, f) {
          return a._BinaryenBinary(b, a.AddSatSVecI8x16, d, f);
        },
        add_saturate_u: function (d, f) {
          return a._BinaryenBinary(b, a.AddSatUVecI8x16, d, f);
        },
        sub: function (d, f) {
          return a._BinaryenBinary(b, a.SubVecI8x16, d, f);
        },
        sub_saturate_s: function (d, f) {
          return a._BinaryenBinary(b, a.SubSatSVecI8x16, d, f);
        },
        sub_saturate_u: function (d, f) {
          return a._BinaryenBinary(b, a.SubSatUVecI8x16, d, f);
        },
        min_s: function (d, f) {
          return a._BinaryenBinary(b, a.MinSVecI8x16, d, f);
        },
        min_u: function (d, f) {
          return a._BinaryenBinary(b, a.MinUVecI8x16, d, f);
        },
        max_s: function (d, f) {
          return a._BinaryenBinary(b, a.MaxSVecI8x16, d, f);
        },
        max_u: function (d, f) {
          return a._BinaryenBinary(b, a.MaxUVecI8x16, d, f);
        },
        avgr_u: function (d, f) {
          return a._BinaryenBinary(b, a.AvgrUVecI8x16, d, f);
        },
        narrow_i16x8_s: function (d, f) {
          return a._BinaryenBinary(b, a.NarrowSVecI16x8ToVecI8x16, d, f);
        },
        narrow_i16x8_u: function (d, f) {
          return a._BinaryenBinary(b, a.NarrowUVecI16x8ToVecI8x16, d, f);
        },
      };
      c.i16x8 = {
        splat: function (d) {
          return a._BinaryenUnary(b, a.SplatVecI16x8, d);
        },
        extract_lane_s: function (d, f) {
          return a._BinaryenSIMDExtract(b, a.ExtractLaneSVecI16x8, d, f);
        },
        extract_lane_u: function (d, f) {
          return a._BinaryenSIMDExtract(b, a.ExtractLaneUVecI16x8, d, f);
        },
        replace_lane: function (d, f, h) {
          return a._BinaryenSIMDReplace(b, a.ReplaceLaneVecI16x8, d, f, h);
        },
        eq: function (d, f) {
          return a._BinaryenBinary(b, a.EqVecI16x8, d, f);
        },
        ne: function (d, f) {
          return a._BinaryenBinary(b, a.NeVecI16x8, d, f);
        },
        lt_s: function (d, f) {
          return a._BinaryenBinary(b, a.LtSVecI16x8, d, f);
        },
        lt_u: function (d, f) {
          return a._BinaryenBinary(b, a.LtUVecI16x8, d, f);
        },
        gt_s: function (d, f) {
          return a._BinaryenBinary(b, a.GtSVecI16x8, d, f);
        },
        gt_u: function (d, f) {
          return a._BinaryenBinary(b, a.GtUVecI16x8, d, f);
        },
        le_s: function (d, f) {
          return a._BinaryenBinary(b, a.LeSVecI16x8, d, f);
        },
        le_u: function (d, f) {
          return a._BinaryenBinary(b, a.LeUVecI16x8, d, f);
        },
        ge_s: function (d, f) {
          return a._BinaryenBinary(b, a.GeSVecI16x8, d, f);
        },
        ge_u: function (d, f) {
          return a._BinaryenBinary(b, a.GeUVecI16x8, d, f);
        },
        abs: function (d) {
          return a._BinaryenUnary(b, a.AbsVecI16x8, d);
        },
        neg: function (d) {
          return a._BinaryenUnary(b, a.NegVecI16x8, d);
        },
        all_true: function (d) {
          return a._BinaryenUnary(b, a.AllTrueVecI16x8, d);
        },
        bitmask: function (d) {
          return a._BinaryenUnary(b, a.BitmaskVecI16x8, d);
        },
        shl: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShlVecI16x8, d, f);
        },
        shr_s: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShrSVecI16x8, d, f);
        },
        shr_u: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShrUVecI16x8, d, f);
        },
        add: function (d, f) {
          return a._BinaryenBinary(b, a.AddVecI16x8, d, f);
        },
        add_saturate_s: function (d, f) {
          return a._BinaryenBinary(b, a.AddSatSVecI16x8, d, f);
        },
        add_saturate_u: function (d, f) {
          return a._BinaryenBinary(b, a.AddSatUVecI16x8, d, f);
        },
        sub: function (d, f) {
          return a._BinaryenBinary(b, a.SubVecI16x8, d, f);
        },
        sub_saturate_s: function (d, f) {
          return a._BinaryenBinary(b, a.SubSatSVecI16x8, d, f);
        },
        sub_saturate_u: function (d, f) {
          return a._BinaryenBinary(b, a.SubSatUVecI16x8, d, f);
        },
        mul: function (d, f) {
          return a._BinaryenBinary(b, a.MulVecI16x8, d, f);
        },
        min_s: function (d, f) {
          return a._BinaryenBinary(b, a.MinSVecI16x8, d, f);
        },
        min_u: function (d, f) {
          return a._BinaryenBinary(b, a.MinUVecI16x8, d, f);
        },
        max_s: function (d, f) {
          return a._BinaryenBinary(b, a.MaxSVecI16x8, d, f);
        },
        max_u: function (d, f) {
          return a._BinaryenBinary(b, a.MaxUVecI16x8, d, f);
        },
        avgr_u: function (d, f) {
          return a._BinaryenBinary(b, a.AvgrUVecI16x8, d, f);
        },
        q15mulr_sat_s: function (d, f) {
          return a._BinaryenBinary(b, a.Q15MulrSatSVecI16x8, d, f);
        },
        extmul_low_i8x16_s: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulLowSVecI16x8, d, f);
        },
        extmul_high_i8x16_s: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulHighSVecI16x8, d, f);
        },
        extmul_low_i8x16_u: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulLowUVecI16x8, d, f);
        },
        extmul_high_i8x16_u: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulHighUVecI16x8, d, f);
        },
        extadd_pairwise_i8x16_s: function (d) {
          return a._BinaryenUnary(b, a.ExtAddPairwiseSVecI8x16ToI16x8, d);
        },
        extadd_pairwise_i8x16_u: function (d) {
          return a._BinaryenUnary(b, a.ExtAddPairwiseUVecI8x16ToI16x8, d);
        },
        narrow_i32x4_s: function (d, f) {
          return a._BinaryenBinary(b, a.NarrowSVecI32x4ToVecI16x8, d, f);
        },
        narrow_i32x4_u: function (d, f) {
          return a._BinaryenBinary(b, a.NarrowUVecI32x4ToVecI16x8, d, f);
        },
        extend_low_i8x16_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendLowSVecI8x16ToVecI16x8, d);
        },
        extend_high_i8x16_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendHighSVecI8x16ToVecI16x8, d);
        },
        extend_low_i8x16_u: function (d) {
          return a._BinaryenUnary(b, a.ExtendLowUVecI8x16ToVecI16x8, d);
        },
        extend_high_i8x16_u: function (d) {
          return a._BinaryenUnary(b, a.ExtendHighUVecI8x16ToVecI16x8, d);
        },
      };
      c.i32x4 = {
        splat: function (d) {
          return a._BinaryenUnary(b, a.SplatVecI32x4, d);
        },
        extract_lane: function (d, f) {
          return a._BinaryenSIMDExtract(b, a.ExtractLaneVecI32x4, d, f);
        },
        replace_lane: function (d, f, h) {
          return a._BinaryenSIMDReplace(b, a.ReplaceLaneVecI32x4, d, f, h);
        },
        eq: function (d, f) {
          return a._BinaryenBinary(b, a.EqVecI32x4, d, f);
        },
        ne: function (d, f) {
          return a._BinaryenBinary(b, a.NeVecI32x4, d, f);
        },
        lt_s: function (d, f) {
          return a._BinaryenBinary(b, a.LtSVecI32x4, d, f);
        },
        lt_u: function (d, f) {
          return a._BinaryenBinary(b, a.LtUVecI32x4, d, f);
        },
        gt_s: function (d, f) {
          return a._BinaryenBinary(b, a.GtSVecI32x4, d, f);
        },
        gt_u: function (d, f) {
          return a._BinaryenBinary(b, a.GtUVecI32x4, d, f);
        },
        le_s: function (d, f) {
          return a._BinaryenBinary(b, a.LeSVecI32x4, d, f);
        },
        le_u: function (d, f) {
          return a._BinaryenBinary(b, a.LeUVecI32x4, d, f);
        },
        ge_s: function (d, f) {
          return a._BinaryenBinary(b, a.GeSVecI32x4, d, f);
        },
        ge_u: function (d, f) {
          return a._BinaryenBinary(b, a.GeUVecI32x4, d, f);
        },
        abs: function (d) {
          return a._BinaryenUnary(b, a.AbsVecI32x4, d);
        },
        neg: function (d) {
          return a._BinaryenUnary(b, a.NegVecI32x4, d);
        },
        all_true: function (d) {
          return a._BinaryenUnary(b, a.AllTrueVecI32x4, d);
        },
        bitmask: function (d) {
          return a._BinaryenUnary(b, a.BitmaskVecI32x4, d);
        },
        shl: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShlVecI32x4, d, f);
        },
        shr_s: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShrSVecI32x4, d, f);
        },
        shr_u: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShrUVecI32x4, d, f);
        },
        add: function (d, f) {
          return a._BinaryenBinary(b, a.AddVecI32x4, d, f);
        },
        sub: function (d, f) {
          return a._BinaryenBinary(b, a.SubVecI32x4, d, f);
        },
        mul: function (d, f) {
          return a._BinaryenBinary(b, a.MulVecI32x4, d, f);
        },
        min_s: function (d, f) {
          return a._BinaryenBinary(b, a.MinSVecI32x4, d, f);
        },
        min_u: function (d, f) {
          return a._BinaryenBinary(b, a.MinUVecI32x4, d, f);
        },
        max_s: function (d, f) {
          return a._BinaryenBinary(b, a.MaxSVecI32x4, d, f);
        },
        max_u: function (d, f) {
          return a._BinaryenBinary(b, a.MaxUVecI32x4, d, f);
        },
        dot_i16x8_s: function (d, f) {
          return a._BinaryenBinary(b, a.DotSVecI16x8ToVecI32x4, d, f);
        },
        extmul_low_i16x8_s: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulLowSVecI32x4, d, f);
        },
        extmul_high_i16x8_s: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulHighSVecI32x4, d, f);
        },
        extmul_low_i16x8_u: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulLowUVecI32x4, d, f);
        },
        extmul_high_i16x8_u: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulHighUVecI32x4, d, f);
        },
        extadd_pairwise_i16x8_s: function (d) {
          return a._BinaryenUnary(b, a.ExtAddPairwiseSVecI16x8ToI32x4, d);
        },
        extadd_pairwise_i16x8_u: function (d) {
          return a._BinaryenUnary(b, a.ExtAddPairwiseUVecI16x8ToI32x4, d);
        },
        trunc_sat_f32x4_s: function (d) {
          return a._BinaryenUnary(b, a.TruncSatSVecF32x4ToVecI32x4, d);
        },
        trunc_sat_f32x4_u: function (d) {
          return a._BinaryenUnary(b, a.TruncSatUVecF32x4ToVecI32x4, d);
        },
        extend_low_i16x8_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendLowSVecI16x8ToVecI32x4, d);
        },
        extend_high_i16x8_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendHighSVecI16x8ToVecI32x4, d);
        },
        extend_low_i16x8_u: function (d) {
          return a._BinaryenUnary(b, a.ExtendLowUVecI16x8ToVecI32x4, d);
        },
        extend_high_i16x8_u: function (d) {
          return a._BinaryenUnary(b, a.ExtendHighUVecI16x8ToVecI32x4, d);
        },
        trunc_sat_f64x2_s_zero: function (d) {
          return a._BinaryenUnary(b, a.TruncSatZeroSVecF64x2ToVecI32x4, d);
        },
        trunc_sat_f64x2_u_zero: function (d) {
          return a._BinaryenUnary(b, a.TruncSatZeroUVecF64x2ToVecI32x4, d);
        },
      };
      c.i64x2 = {
        splat: function (d) {
          return a._BinaryenUnary(b, a.SplatVecI64x2, d);
        },
        extract_lane: function (d, f) {
          return a._BinaryenSIMDExtract(b, a.ExtractLaneVecI64x2, d, f);
        },
        replace_lane: function (d, f, h) {
          return a._BinaryenSIMDReplace(b, a.ReplaceLaneVecI64x2, d, f, h);
        },
        eq: function (d, f) {
          return a._BinaryenBinary(b, a.EqVecI64x2, d, f);
        },
        ne: function (d, f) {
          return a._BinaryenBinary(b, a.NeVecI64x2, d, f);
        },
        lt_s: function (d, f) {
          return a._BinaryenBinary(b, a.LtSVecI64x2, d, f);
        },
        gt_s: function (d, f) {
          return a._BinaryenBinary(b, a.GtSVecI64x2, d, f);
        },
        le_s: function (d, f) {
          return a._BinaryenBinary(b, a.LeSVecI64x2, d, f);
        },
        ge_s: function (d, f) {
          return a._BinaryenBinary(b, a.GeSVecI64x2, d, f);
        },
        abs: function (d) {
          return a._BinaryenUnary(b, a.AbsVecI64x2, d);
        },
        neg: function (d) {
          return a._BinaryenUnary(b, a.NegVecI64x2, d);
        },
        all_true: function (d) {
          return a._BinaryenUnary(b, a.AllTrueVecI64x2, d);
        },
        bitmask: function (d) {
          return a._BinaryenUnary(b, a.BitmaskVecI64x2, d);
        },
        shl: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShlVecI64x2, d, f);
        },
        shr_s: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShrSVecI64x2, d, f);
        },
        shr_u: function (d, f) {
          return a._BinaryenSIMDShift(b, a.ShrUVecI64x2, d, f);
        },
        add: function (d, f) {
          return a._BinaryenBinary(b, a.AddVecI64x2, d, f);
        },
        sub: function (d, f) {
          return a._BinaryenBinary(b, a.SubVecI64x2, d, f);
        },
        mul: function (d, f) {
          return a._BinaryenBinary(b, a.MulVecI64x2, d, f);
        },
        extmul_low_i32x4_s: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulLowSVecI64x2, d, f);
        },
        extmul_high_i32x4_s: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulHighSVecI64x2, d, f);
        },
        extmul_low_i32x4_u: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulLowUVecI64x2, d, f);
        },
        extmul_high_i32x4_u: function (d, f) {
          return a._BinaryenBinary(b, a.ExtMulHighUVecI64x2, d, f);
        },
        extend_low_i32x4_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendLowSVecI32x4ToVecI64x2, d);
        },
        extend_high_i32x4_s: function (d) {
          return a._BinaryenUnary(b, a.ExtendHighSVecI32x4ToVecI64x2, d);
        },
        extend_low_i32x4_u: function (d) {
          return a._BinaryenUnary(b, a.ExtendLowUVecI32x4ToVecI64x2, d);
        },
        extend_high_i32x4_u: function (d) {
          return a._BinaryenUnary(b, a.ExtendHighUVecI32x4ToVecI64x2, d);
        },
      };
      c.f32x4 = {
        splat: function (d) {
          return a._BinaryenUnary(b, a.SplatVecF32x4, d);
        },
        extract_lane: function (d, f) {
          return a._BinaryenSIMDExtract(b, a.ExtractLaneVecF32x4, d, f);
        },
        replace_lane: function (d, f, h) {
          return a._BinaryenSIMDReplace(b, a.ReplaceLaneVecF32x4, d, f, h);
        },
        eq: function (d, f) {
          return a._BinaryenBinary(b, a.EqVecF32x4, d, f);
        },
        ne: function (d, f) {
          return a._BinaryenBinary(b, a.NeVecF32x4, d, f);
        },
        lt: function (d, f) {
          return a._BinaryenBinary(b, a.LtVecF32x4, d, f);
        },
        gt: function (d, f) {
          return a._BinaryenBinary(b, a.GtVecF32x4, d, f);
        },
        le: function (d, f) {
          return a._BinaryenBinary(b, a.LeVecF32x4, d, f);
        },
        ge: function (d, f) {
          return a._BinaryenBinary(b, a.GeVecF32x4, d, f);
        },
        abs: function (d) {
          return a._BinaryenUnary(b, a.AbsVecF32x4, d);
        },
        neg: function (d) {
          return a._BinaryenUnary(b, a.NegVecF32x4, d);
        },
        sqrt: function (d) {
          return a._BinaryenUnary(b, a.SqrtVecF32x4, d);
        },
        add: function (d, f) {
          return a._BinaryenBinary(b, a.AddVecF32x4, d, f);
        },
        sub: function (d, f) {
          return a._BinaryenBinary(b, a.SubVecF32x4, d, f);
        },
        mul: function (d, f) {
          return a._BinaryenBinary(b, a.MulVecF32x4, d, f);
        },
        div: function (d, f) {
          return a._BinaryenBinary(b, a.DivVecF32x4, d, f);
        },
        min: function (d, f) {
          return a._BinaryenBinary(b, a.MinVecF32x4, d, f);
        },
        max: function (d, f) {
          return a._BinaryenBinary(b, a.MaxVecF32x4, d, f);
        },
        pmin: function (d, f) {
          return a._BinaryenBinary(b, a.PMinVecF32x4, d, f);
        },
        pmax: function (d, f) {
          return a._BinaryenBinary(b, a.PMaxVecF32x4, d, f);
        },
        ceil: function (d) {
          return a._BinaryenUnary(b, a.CeilVecF32x4, d);
        },
        floor: function (d) {
          return a._BinaryenUnary(b, a.FloorVecF32x4, d);
        },
        trunc: function (d) {
          return a._BinaryenUnary(b, a.TruncVecF32x4, d);
        },
        nearest: function (d) {
          return a._BinaryenUnary(b, a.NearestVecF32x4, d);
        },
        convert_i32x4_s: function (d) {
          return a._BinaryenUnary(b, a.ConvertSVecI32x4ToVecF32x4, d);
        },
        convert_i32x4_u: function (d) {
          return a._BinaryenUnary(b, a.ConvertUVecI32x4ToVecF32x4, d);
        },
        demote_f64x2_zero: function (d) {
          return a._BinaryenUnary(b, a.DemoteZeroVecF64x2ToVecF32x4, d);
        },
      };
      c.f64x2 = {
        splat: function (d) {
          return a._BinaryenUnary(b, a.SplatVecF64x2, d);
        },
        extract_lane: function (d, f) {
          return a._BinaryenSIMDExtract(b, a.ExtractLaneVecF64x2, d, f);
        },
        replace_lane: function (d, f, h) {
          return a._BinaryenSIMDReplace(b, a.ReplaceLaneVecF64x2, d, f, h);
        },
        eq: function (d, f) {
          return a._BinaryenBinary(b, a.EqVecF64x2, d, f);
        },
        ne: function (d, f) {
          return a._BinaryenBinary(b, a.NeVecF64x2, d, f);
        },
        lt: function (d, f) {
          return a._BinaryenBinary(b, a.LtVecF64x2, d, f);
        },
        gt: function (d, f) {
          return a._BinaryenBinary(b, a.GtVecF64x2, d, f);
        },
        le: function (d, f) {
          return a._BinaryenBinary(b, a.LeVecF64x2, d, f);
        },
        ge: function (d, f) {
          return a._BinaryenBinary(b, a.GeVecF64x2, d, f);
        },
        abs: function (d) {
          return a._BinaryenUnary(b, a.AbsVecF64x2, d);
        },
        neg: function (d) {
          return a._BinaryenUnary(b, a.NegVecF64x2, d);
        },
        sqrt: function (d) {
          return a._BinaryenUnary(b, a.SqrtVecF64x2, d);
        },
        add: function (d, f) {
          return a._BinaryenBinary(b, a.AddVecF64x2, d, f);
        },
        sub: function (d, f) {
          return a._BinaryenBinary(b, a.SubVecF64x2, d, f);
        },
        mul: function (d, f) {
          return a._BinaryenBinary(b, a.MulVecF64x2, d, f);
        },
        div: function (d, f) {
          return a._BinaryenBinary(b, a.DivVecF64x2, d, f);
        },
        min: function (d, f) {
          return a._BinaryenBinary(b, a.MinVecF64x2, d, f);
        },
        max: function (d, f) {
          return a._BinaryenBinary(b, a.MaxVecF64x2, d, f);
        },
        pmin: function (d, f) {
          return a._BinaryenBinary(b, a.PMinVecF64x2, d, f);
        },
        pmax: function (d, f) {
          return a._BinaryenBinary(b, a.PMaxVecF64x2, d, f);
        },
        ceil: function (d) {
          return a._BinaryenUnary(b, a.CeilVecF64x2, d);
        },
        floor: function (d) {
          return a._BinaryenUnary(b, a.FloorVecF64x2, d);
        },
        trunc: function (d) {
          return a._BinaryenUnary(b, a.TruncVecF64x2, d);
        },
        nearest: function (d) {
          return a._BinaryenUnary(b, a.NearestVecF64x2, d);
        },
        convert_low_i32x4_s: function (d) {
          return a._BinaryenUnary(b, a.ConvertLowSVecI32x4ToVecF64x2, d);
        },
        convert_low_i32x4_u: function (d) {
          return a._BinaryenUnary(b, a.ConvertLowUVecI32x4ToVecF64x2, d);
        },
        promote_low_f32x4: function (d) {
          return a._BinaryenUnary(b, a.PromoteLowVecF32x4ToVecF64x2, d);
        },
      };
      c.funcref = {
        pop: function () {
          return a._BinaryenPop(b, a.funcref);
        },
      };
      c.externref = {
        pop: function () {
          return a._BinaryenPop(b, a.externref);
        },
      };
      c.anyref = {
        pop: function () {
          return a._BinaryenPop(b, a.anyref);
        },
      };
      c.eqref = {
        pop: function () {
          return a._BinaryenPop(b, a.eqref);
        },
      };
      c.i31ref = {
        pop: function () {
          return a._BinaryenPop(b, a.i31ref);
        },
      };
      c.structref = {
        pop: function () {
          return a._BinaryenPop(b, a.structref);
        },
      };
      c.stringref = {
        pop: function () {
          return a._BinaryenPop(b, a.stringref);
        },
      };
      c.ref = {
        ['null'](d) {
          return a._BinaryenRefNull(b, d);
        },
        is_null: function (d) {
          return a._BinaryenRefIsNull(b, d);
        },
        as_non_null: function (d) {
          return a._BinaryenRefAs(b, a.RefAsNonNull, d);
        },
        func: function (d, f) {
          return S(() => a._BinaryenRefFunc(b, T(d), f));
        },
        i31: function (d) {
          return a._BinaryenRefI31(b, d);
        },
        eq: function (d, f) {
          return a._BinaryenRefEq(b, d, f);
        },
        test: function (d, f) {
          return a._BinaryenRefTest(b, d, f);
        },
        cast: function (d, f) {
          return a._BinaryenRefCast(b, d, f);
        },
      };
      c.select = function (d, f, h) {
        return a._BinaryenSelect(b, d, f, h);
      };
      c.drop = function (d) {
        return a._BinaryenDrop(b, d);
      };
      c['return'] = function (d) {
        return a._BinaryenReturn(b, d);
      };
      c.nop = function () {
        return a._BinaryenNop(b);
      };
      c.unreachable = function () {
        return a._BinaryenUnreachable(b);
      };
      c.atomic = {
        fence: function () {
          return a._BinaryenAtomicFence(b);
        },
      };
      c['try'] = function (d, f, h, k, l) {
        return S(() =>
          a._BinaryenTry(b, d ? T(d) : 0, f, U(h.map(T)), h.length, U(k), k.length, l ? T(l) : 0)
        );
      };
      c['throw'] = function (d, f) {
        return S(() => a._BinaryenThrow(b, T(d), U(f), f.length));
      };
      c.rethrow = function (d) {
        return S(() => a._BinaryenRethrow(b, T(d)));
      };
      c.tuple = {
        make: function (d) {
          return S(() => a._BinaryenTupleMake(b, U(d), d.length));
        },
        extract: function (d, f) {
          return a._BinaryenTupleExtract(b, d, f);
        },
      };
      c.i31 = {
        get_s: function (d) {
          return a._BinaryenI31Get(b, d, 1);
        },
        get_u: function (d) {
          return a._BinaryenI31Get(b, d, 0);
        },
      };
      c.any = {
        convert_extern: function () {
          return a._BinaryenRefAsAnyConvertExtern();
        },
      };
      c.extern = {
        convert_any: function () {
          return a._BinaryenRefAsExternConvertAny();
        },
      };
      c.br_on_null = function (d, f) {
        return S(() => a._BinaryenBrOn(b, a.BrOnNull, T(d), f, a.unreachable));
      };
      c.br_on_non_null = function (d, f) {
        return S(() => a._BinaryenBrOn(b, a.BrOnNonNull, T(d), f, a.unreachable));
      };
      c.br_on_cast = function (d, f, h) {
        return S(() => a._BinaryenBrOn(b, a.BrOnCast, T(d), f, h));
      };
      c.br_on_cast_fail = function (d, f, h) {
        return S(() => a._BinaryenBrOn(b, a.BrOnCastFail, T(d), f, h));
      };
      c.struct = {
        ['new'](d, f) {
          return S(() => a._BinaryenStructNew(b, U(d), d.length, f));
        },
        new_default: function (d) {
          return a._BinaryenStructNew(b, 0, 0, d);
        },
        get: function (d, f, h, k) {
          return a._BinaryenStructGet(b, d, f, h, k);
        },
        set: function (d, f, h) {
          return a._BinaryenStructSet(b, d, f, h);
        },
      };
      c.array = {
        ['new'](d, f, h) {
          return a._BinaryenArrayNew(b, d, f, h);
        },
        new_default: function (d, f) {
          return a._BinaryenArrayNew(b, d, f, 0);
        },
        new_fixed: function (d, f) {
          return S(() => a._BinaryenArrayNewFixed(b, d, U(f), f.length));
        },
        new_data: function (d, f, h, k) {
          return S(() => a._BinaryenArrayNewData(b, d, T(f), h, k));
        },
        new_elem: function (d, f, h, k) {
          return S(() => a._BinaryenArrayNewElem(b, d, T(f), h, k));
        },
        get: function (d, f, h, k) {
          return a._BinaryenArrayGet(b, d, f, h, k);
        },
        set: function (d, f, h) {
          return a._BinaryenArraySet(b, d, f, h);
        },
        len: function (d) {
          return a._BinaryenArrayLen(b, d);
        },
        fill: function (d, f, h, k) {
          return a._BinaryenArrayFill(b, d, f, h, k);
        },
        copy: function (d, f, h, k, l) {
          return a._BinaryenArrayCopy(b, d, f, h, k, l);
        },
        init_data: function (d, f, h, k, l) {
          return S(() => a._BinaryenArrayInitData(b, T(d), f, h, k, l));
        },
        init_elem: function (d, f, h, k, l) {
          return S(() => a._BinaryenArrayInitElem(b, T(d), f, h, k, l));
        },
      };
      c.addFunction = function (d, f, h, k, l) {
        return S(() => a._BinaryenAddFunction(b, T(d), f, h, U(k), k.length, l));
      };
      c.getFunction = function (d) {
        return S(() => a._BinaryenGetFunction(b, T(d)));
      };
      c.removeFunction = function (d) {
        return S(() => a._BinaryenRemoveFunction(b, T(d)));
      };
      c.addGlobal = function (d, f, h, k) {
        return S(() => a._BinaryenAddGlobal(b, T(d), f, h, k));
      };
      c.getGlobal = function (d) {
        return S(() => a._BinaryenGetGlobal(b, T(d)));
      };
      c.addTable = function (d, f, h, k = a._BinaryenTypeFuncref()) {
        return S(() => a._BinaryenAddTable(b, T(d), f, h, k));
      };
      c.getTable = function (d) {
        return S(() => a._BinaryenGetTable(b, T(d)));
      };
      c.addActiveElementSegment = function (d, f, h, k = c.i32['const'](0)) {
        return S(() => a._BinaryenAddActiveElementSegment(b, T(d), T(f), U(h.map(T)), h.length, k));
      };
      c.addPassiveElementSegment = function (d, f) {
        return S(() => a._BinaryenAddPassiveElementSegment(b, T(d), U(f.map(T)), f.length));
      };
      c.getElementSegment = function (d) {
        return S(() => a._BinaryenGetElementSegment(b, T(d)));
      };
      c.getTableSegments = function (d) {
        var f = a._BinaryenGetNumElementSegments(b);
        d = I(a._BinaryenTableGetName(d));
        for (var h = [], k = 0; k < f; k++) {
          var l = a._BinaryenGetElementSegmentByIndex(b, k),
            p = I(a._BinaryenElementSegmentGetTable(l));
          d === p && h.push(l);
        }
        return h;
      };
      c.removeGlobal = function (d) {
        return S(() => a._BinaryenRemoveGlobal(b, T(d)));
      };
      c.removeTable = function (d) {
        return S(() => a._BinaryenRemoveTable(b, T(d)));
      };
      c.removeElementSegment = function (d) {
        return S(() => a._BinaryenRemoveElementSegment(b, T(d)));
      };
      c.addTag = function (d, f, h) {
        return S(() => a._BinaryenAddTag(b, T(d), f, h));
      };
      c.getTag = function (d) {
        return S(() => a._BinaryenGetTag(b, T(d)));
      };
      c.removeTag = function (d) {
        return S(() => a._BinaryenRemoveTag(b, T(d)));
      };
      c.addFunctionImport = function (d, f, h, k, l) {
        return S(() => a._BinaryenAddFunctionImport(b, T(d), T(f), T(h), k, l));
      };
      c.addTableImport = function (d, f, h) {
        return S(() => a._BinaryenAddTableImport(b, T(d), T(f), T(h)));
      };
      c.addMemoryImport = function (d, f, h, k) {
        return S(() => a._BinaryenAddMemoryImport(b, T(d), T(f), T(h), k));
      };
      c.addGlobalImport = function (d, f, h, k, l) {
        return S(() => a._BinaryenAddGlobalImport(b, T(d), T(f), T(h), k, l));
      };
      c.addTagImport = function (d, f, h, k, l) {
        return S(() => a._BinaryenAddTagImport(b, T(d), T(f), T(h), k, l));
      };
      c.addExport = c.addFunctionExport = function (d, f) {
        return S(() => a._BinaryenAddFunctionExport(b, T(d), T(f)));
      };
      c.addTableExport = function (d, f) {
        return S(() => a._BinaryenAddTableExport(b, T(d), T(f)));
      };
      c.addMemoryExport = function (d, f) {
        return S(() => a._BinaryenAddMemoryExport(b, T(d), T(f)));
      };
      c.addGlobalExport = function (d, f) {
        return S(() => a._BinaryenAddGlobalExport(b, T(d), T(f)));
      };
      c.addTagExport = function (d, f) {
        return S(() => a._BinaryenAddTagExport(b, T(d), T(f)));
      };
      c.removeExport = function (d) {
        return S(() => a._BinaryenRemoveExport(b, T(d)));
      };
      c.setMemory = function (d, f, h, k = [], l = !1, p = !1, q = null) {
        return S(() => {
          const r = k.length;
          var t = Array(r);
          const A = Array(r);
          var D = Array(r);
          const G = Array(r),
            H = Array(r);
          for (let J = 0; J < r; J++) {
            const { name: Q, data: X, offset: eb, passive: N } = k[J];
            t[J] = Q ? T(Q) : null;
            A[J] = Td(X.length);
            n.set(X, A[J]);
            D[J] = X.length;
            G[J] = N;
            H[J] = eb;
          }
          t = a._BinaryenSetMemory(b, d, f, T(h), U(t), U(A), bf(G), U(H), U(D), r, l, p, T(q));
          for (D = 0; D < r; D++) Wd(A[D]);
          return t;
        });
      };
      c.hasMemory = function () {
        return !!a._BinaryenHasMemory(b);
      };
      c.getMemoryInfo = function (d) {
        return S(() => {
          var f = {
            module: I(a._BinaryenMemoryImportGetModule(b, T(d))),
            base: I(a._BinaryenMemoryImportGetBase(b, T(d))),
            initial: a._BinaryenMemoryGetInitial(b, T(d)),
            shared: !!a._BinaryenMemoryIsShared(b, T(d)),
            is64: !!a._BinaryenMemoryIs64(b, T(d)),
          };
          a._BinaryenMemoryHasMax(b, T(d)) && (f.max = a._BinaryenMemoryGetMax(b, T(d)));
          return f;
        });
      };
      c.getNumMemorySegments = function () {
        return a._BinaryenGetNumMemorySegments(b);
      };
      c.getMemorySegmentInfo = function (d) {
        return S(() => {
          const f = !!a._BinaryenGetMemorySegmentPassive(b, T(d));
          var h = null;
          f || (h = a._BinaryenGetMemorySegmentByteOffset(b, T(d)));
          const k = a._BinaryenGetMemorySegmentByteLength(b, T(d)),
            l = Td(k);
          a._BinaryenCopyMemorySegmentData(b, T(d), l);
          const p = new Uint8Array(k);
          p.set(n.subarray(l, l + k));
          Wd(l);
          return { offset: h, data: p.buffer, passive: f };
        });
      };
      c.setStart = function (d) {
        return a._BinaryenSetStart(b, d);
      };
      c.getStart = function () {
        return a._BinaryenGetStart(b);
      };
      c.getFeatures = function () {
        return a._BinaryenModuleGetFeatures(b);
      };
      c.setFeatures = function (d) {
        a._BinaryenModuleSetFeatures(b, d);
      };
      c.setTypeName = function (d, f) {
        return S(() => a._BinaryenModuleSetTypeName(b, d, T(f)));
      };
      c.setFieldName = function (d, f, h) {
        return S(() => a._BinaryenModuleSetFieldName(b, d, f, T(h)));
      };
      c.addCustomSection = function (d, f) {
        return S(() => a._BinaryenAddCustomSection(b, T(d), bf(f), f.length));
      };
      c.getExport = function (d) {
        return S(() => a._BinaryenGetExport(b, T(d)));
      };
      c.getNumExports = function () {
        return a._BinaryenGetNumExports(b);
      };
      c.getExportByIndex = function (d) {
        return a._BinaryenGetExportByIndex(b, d);
      };
      c.getNumFunctions = function () {
        return a._BinaryenGetNumFunctions(b);
      };
      c.getFunctionByIndex = function (d) {
        return a._BinaryenGetFunctionByIndex(b, d);
      };
      c.getNumGlobals = function () {
        return a._BinaryenGetNumGlobals(b);
      };
      c.getNumTables = function () {
        return a._BinaryenGetNumTables(b);
      };
      c.getNumElementSegments = function () {
        return a._BinaryenGetNumElementSegments(b);
      };
      c.getGlobalByIndex = function (d) {
        return a._BinaryenGetGlobalByIndex(b, d);
      };
      c.getTableByIndex = function (d) {
        return a._BinaryenGetTableByIndex(b, d);
      };
      c.getElementSegmentByIndex = function (d) {
        return a._BinaryenGetElementSegmentByIndex(b, d);
      };
      c.emitText = function () {
        let d = a._BinaryenModuleAllocateAndWriteText(b),
          f = d ? y(u, d) : '';
        d && Wd(d);
        return f;
      };
      c.emitStackIR = function () {
        let d = a._BinaryenModuleAllocateAndWriteStackIR(b),
          f = d ? y(u, d) : '';
        d && Wd(d);
        return f;
      };
      c.emitAsmjs = function () {
        const d = m;
        let f = '';
        m = h => {
          f += h + '\n';
        };
        a._BinaryenModulePrintAsmjs(b);
        m = d;
        return f;
      };
      c.validate = function () {
        return a._BinaryenModuleValidate(b);
      };
      c.optimize = function () {
        return a._BinaryenModuleOptimize(b);
      };
      c.optimizeFunction = function (d) {
        'string' === typeof d && (d = c.getFunction(d));
        return a._BinaryenFunctionOptimize(d, b);
      };
      c.runPasses = function (d) {
        return S(() => a._BinaryenModuleRunPasses(b, U(d.map(T)), d.length));
      };
      c.runPassesOnFunction = function (d, f) {
        'string' === typeof d && (d = c.getFunction(d));
        return S(() => a._BinaryenFunctionRunPasses(d, b, U(f.map(T)), f.length));
      };
      c.dispose = function () {
        a._BinaryenModuleDispose(b);
      };
      c.emitBinary = function (d) {
        return S(() => {
          var f = L(Vd());
          a._BinaryenModuleAllocateAndWrite(f, b, T(d));
          const h = w[f >>> 2],
            k = w[(f >>> 2) + 1];
          f = w[(f >>> 2) + 2];
          try {
            const l = new Uint8Array(k);
            l.set(u.subarray(h, h + k));
            return 'undefined' === typeof d ? l : { binary: l, sourceMap: f ? y(u, f) : '' };
          } finally {
            (Wd(h), f && Wd(f));
          }
        });
      };
      c.interpret = function () {
        return a._BinaryenModuleInterpret(b);
      };
      c.addDebugInfoFileName = function (d) {
        return S(() => a._BinaryenModuleAddDebugInfoFileName(b, T(d)));
      };
      c.getDebugInfoFileName = function (d) {
        return I(a._BinaryenModuleGetDebugInfoFileName(b, d));
      };
      c.setDebugLocation = function (d, f, h, k, l) {
        return a._BinaryenFunctionSetDebugLocation(d, f, h, k, l);
      };
      c.copyExpression = function (d) {
        return a._BinaryenExpressionCopy(d, b);
      };
      return c;
    }
    a.wrapModule = df;
    a.TypeBuilder = function (b) {
      const c = a._TypeBuilderCreate(b);
      this.ptr = c;
      this.grow = function (g) {
        a._TypeBuilderGrow(c, g);
      };
      this.getSize = function () {
        return a._TypeBuilderGetSize(c);
      };
      this.setSignatureType = function (g, d, f) {
        a._TypeBuilderSetSignatureType(c, g, d, f);
      };
      this.setStructType = function (g, d = []) {
        S(() => {
          const f = d.length,
            h = Array(f),
            k = Array(f),
            l = Array(f);
          for (let p = 0; p < f; p++) {
            const { type: q, packedType: r, mutable: t } = d[p];
            h[p] = q;
            k[p] = r;
            l[p] = t;
          }
          a._TypeBuilderSetStructType(c, g, U(h), U(k), bf(l), f);
        });
      };
      this.setArrayType = function (g, d, f, h) {
        a._TypeBuilderSetArrayType(c, g, d, f, h);
      };
      this.getTempHeapType = function (g) {
        return a._TypeBuilderGetTempHeapType(c, g);
      };
      this.getTempTupleType = function (g) {
        return S(() => a._TypeBuilderGetTempTupleType(c, U(g), g.length));
      };
      this.getTempRefType = function (g, d) {
        return a._TypeBuilderGetTempRefType(c, g, d);
      };
      this.setSubType = function (g, d) {
        a._TypeBuilderSetSubType(c, g, d);
      };
      this.setOpen = function (g) {
        a._TypeBuilderSetOpen(c, g);
      };
      this.createRecGroup = function (g, d) {
        a._TypeBuilderCreateRecGroup(c, g, d);
      };
      this.buildAndDispose = function () {
        return S(() => {
          const g = this.getSize(),
            d = L(g << 2);
          if (!a._TypeBuilderBuildAndDispose(c, d, 0, 0))
            throw new TypeError('TypeBuilder.buildAndDispose failed');
          const f = Array(g);
          for (let h = 0; h < g; h++) f[h] = w[(d >>> 2) + h];
          return f;
        });
      };
    };
    a.getTypeFromHeapType = function (b, c) {
      return a._BinaryenTypeFromHeapType(b, c);
    };
    a.getHeapType = function (b) {
      return a._BinaryenTypeGetHeapType(b);
    };
    a.Relooper = function (b) {
      (b && 'object' === typeof b && b.ptr && b.block && b['if']) || x();
      const c = a._RelooperCreate(b.ptr);
      this.ptr = c;
      this.addBlock = function (g) {
        return a._RelooperAddBlock(c, g);
      };
      this.addBranch = function (g, d, f, h) {
        return a._RelooperAddBranch(g, d, f, h);
      };
      this.addBlockWithSwitch = function (g, d) {
        return a._RelooperAddBlockWithSwitch(c, g, d);
      };
      this.addBranchForSwitch = function (g, d, f, h) {
        return S(() => a._RelooperAddBranchForSwitch(g, d, U(f), f.length, h));
      };
      this.renderAndDispose = function (g, d) {
        return a._RelooperRenderAndDispose(c, g, d);
      };
    };
    a.ExpressionRunner = function (b, c, g, d) {
      const f = a._ExpressionRunnerCreate(b.ptr, c, g, d);
      this.ptr = f;
      this.setLocalValue = function (h, k) {
        return !!a._ExpressionRunnerSetLocalValue(f, h, k);
      };
      this.setGlobalValue = function (h, k) {
        return S(() => !!a._ExpressionRunnerSetGlobalValue(f, T(h), k));
      };
      this.runAndDispose = function (h) {
        return a._ExpressionRunnerRunAndDispose(f, h);
      };
    };
    function V(b, c, g) {
      c = c(b);
      const d = Array(c);
      for (let f = 0; f < c; ++f) d[f] = g(b, f);
      return d;
    }
    function W(b, c, g, d, f, h) {
      const k = c.length;
      g = g(b);
      let l = 0;
      for (; l < k; ) (l < g ? d(b, l, c[l]) : f(b, c[l]), ++l);
      for (; g > l; ) h(b, --g);
    }
    a.getExpressionId = function (b) {
      return a._BinaryenExpressionGetId(b);
    };
    a.getExpressionType = function (b) {
      return a._BinaryenExpressionGetType(b);
    };
    a.getExpressionInfo = function (b) {
      const c = a._BinaryenExpressionGetId(b),
        g = a._BinaryenExpressionGetType(b),
        d = { id: c, type: g };
      switch (c) {
        case a.ConstId:
          switch (g) {
            case a.i32:
              d.value = a._BinaryenConstGetValueI32(b);
              break;
            case a.i64:
              d.value = {
                low: a._BinaryenConstGetValueI64Low(b),
                high: a._BinaryenConstGetValueI64High(b),
              };
              break;
            case a.f32:
              d.value = a._BinaryenConstGetValueF32(b);
              break;
            case a.f64:
              d.value = a._BinaryenConstGetValueF64(b);
              break;
            case a.v128:
              S(() => {
                const h = L(16);
                a._BinaryenConstGetValueV128(b, h);
                d.value = Array(16);
                for (let k = 0; 16 > k; k++) d.value[k] = u[h + k];
              });
              break;
            default:
              throw Error('unexpected type: ' + g);
          }
          break;
        default:
          const f = ef[c];
          Object.keys(f).forEach(h => {
            const k = f[h];
            if ('function' === typeof k) {
              var l;
              1 === k.length &&
                (l = h.match(/(^get|^(?=is|has))/)) &&
                ((l = l[1].length), (d[h.charAt(l).toLowerCase() + h.substring(l + 1)] = k(b)));
            }
          });
      }
      return d;
    };
    a.getSideEffects = function (b, c) {
      c || x();
      return a._BinaryenExpressionGetSideEffects(b, c.ptr);
    };
    a.createType = function (b) {
      return S(() => a._BinaryenTypeCreate(U(b), b.length));
    };
    a.expandType = function (b) {
      return S(() => {
        const c = a._BinaryenTypeArity(b),
          g = L(c << 2);
        a._BinaryenTypeExpand(b, g);
        const d = Array(c);
        for (let f = 0; f < c; f++) d[f] = w[(g >>> 2) + f];
        return d;
      });
    };
    a.getFunctionInfo = function (b) {
      return {
        name: I(a._BinaryenFunctionGetName(b)),
        module: I(a._BinaryenFunctionImportGetModule(b)),
        base: I(a._BinaryenFunctionImportGetBase(b)),
        type: a._BinaryenFunctionGetType(b),
        params: a._BinaryenFunctionGetParams(b),
        results: a._BinaryenFunctionGetResults(b),
        vars: V(b, a._BinaryenFunctionGetNumVars, a._BinaryenFunctionGetVar),
        body: a._BinaryenFunctionGetBody(b),
      };
    };
    a.getGlobalInfo = function (b) {
      return {
        name: I(a._BinaryenGlobalGetName(b)),
        module: I(a._BinaryenGlobalImportGetModule(b)),
        base: I(a._BinaryenGlobalImportGetBase(b)),
        type: a._BinaryenGlobalGetType(b),
        mutable: !!a._BinaryenGlobalIsMutable(b),
        init: a._BinaryenGlobalGetInitExpr(b),
      };
    };
    a.getTableInfo = function (b) {
      var c = !!a._BinaryenTableHasMax(b),
        g = {
          name: I(a._BinaryenTableGetName(b)),
          module: I(a._BinaryenTableImportGetModule(b)),
          base: I(a._BinaryenTableImportGetBase(b)),
          initial: a._BinaryenTableGetInitial(b),
        };
      c && (g.max = a._BinaryenTableGetMax(b));
      return g;
    };
    a.getElementSegmentInfo = function (b) {
      var c = a._BinaryenElementSegmentGetLength(b),
        g = Array(c);
      for (let f = 0; f !== c; ++f) {
        var d = a._BinaryenElementSegmentGetData(b, f);
        g[f] = d ? y(u, d) : '';
      }
      return {
        name: I(a._BinaryenElementSegmentGetName(b)),
        table: I(a._BinaryenElementSegmentGetTable(b)),
        offset: a._BinaryenElementSegmentGetOffset(b),
        data: g,
      };
    };
    a.getTagInfo = function (b) {
      return {
        name: I(a._BinaryenTagGetName(b)),
        module: I(a._BinaryenTagImportGetModule(b)),
        base: I(a._BinaryenTagImportGetBase(b)),
        params: a._BinaryenTagGetParams(b),
        results: a._BinaryenTagGetResults(b),
      };
    };
    a.getExportInfo = function (b) {
      return {
        kind: a._BinaryenExportGetKind(b),
        name: I(a._BinaryenExportGetName(b)),
        value: I(a._BinaryenExportGetValue(b)),
      };
    };
    a.emitText = function (b) {
      if ('object' === typeof b) return b.ND();
      const c = m;
      let g = '';
      m = d => {
        g += d + '\n';
      };
      a._BinaryenExpressionPrint(b);
      m = c;
      return g;
    };
    Object.defineProperty(a, 'readBinary', { writable: !0 });
    a.readBinary = function (b) {
      const c = Td(b.length);
      n.set(b, c);
      b = a._BinaryenModuleRead(c, b.length);
      Wd(c);
      return df(b);
    };
    a.parseText = function (b) {
      const c = Td(b.length + 1);
      mc(b, c);
      b = a._BinaryenModuleParse(c);
      Wd(c);
      return df(b);
    };
    a.getOptimizeLevel = function () {
      return a._BinaryenGetOptimizeLevel();
    };
    a.setOptimizeLevel = function (b) {
      a._BinaryenSetOptimizeLevel(b);
    };
    a.getShrinkLevel = function () {
      return a._BinaryenGetShrinkLevel();
    };
    a.setShrinkLevel = function (b) {
      a._BinaryenSetShrinkLevel(b);
    };
    a.getDebugInfo = function () {
      return !!a._BinaryenGetDebugInfo();
    };
    a.setDebugInfo = function (b) {
      a._BinaryenSetDebugInfo(b);
    };
    a.getTrapsNeverHappen = function () {
      return !!a._BinaryenGetTrapsNeverHappen();
    };
    a.setTrapsNeverHappen = function (b) {
      a._BinaryenSetTrapsNeverHappen(b);
    };
    a.getClosedWorld = function () {
      return !!a._BinaryenGetClosedWorld();
    };
    a.setClosedWorld = function (b) {
      a._BinaryenSetClosedWorld(b);
    };
    a.getLowMemoryUnused = function () {
      return !!a._BinaryenGetLowMemoryUnused();
    };
    a.setLowMemoryUnused = function (b) {
      a._BinaryenSetLowMemoryUnused(b);
    };
    a.getZeroFilledMemory = function () {
      return !!a._BinaryenGetZeroFilledMemory();
    };
    a.setZeroFilledMemory = function (b) {
      a._BinaryenSetZeroFilledMemory(b);
    };
    a.getFastMath = function () {
      return !!a._BinaryenGetFastMath();
    };
    a.setFastMath = function (b) {
      a._BinaryenSetFastMath(b);
    };
    a.getGenerateStackIR = function () {
      return !!a._BinaryenGetGenerateStackIR();
    };
    a.setGenerateStackIR = function (b) {
      a._BinaryenSetGenerateStackIR(b);
    };
    a.getOptimizeStackIR = function () {
      return !!a._BinaryenGetOptimizeStackIR();
    };
    a.setOptimizeStackIR = function (b) {
      a._BinaryenSetOptimizeStackIR(b);
    };
    a.getPassArgument = function (b) {
      return S(() => {
        const c = a._BinaryenGetPassArgument(T(b));
        return 0 !== c ? (c ? y(u, c) : '') : null;
      });
    };
    a.setPassArgument = function (b, c) {
      S(() => {
        a._BinaryenSetPassArgument(T(b), T(c));
      });
    };
    a.clearPassArguments = function () {
      a._BinaryenClearPassArguments();
    };
    a.hasPassToSkip = function (b) {
      return S(() => !!a._BinaryenHasPassToSkip(T(b)));
    };
    a.addPassToSkip = function (b) {
      S(() => {
        a._BinaryenAddPassToSkip(T(b));
      });
    };
    a.clearPassesToSkip = function () {
      a._BinaryenClearPassesToSkip();
    };
    a.getAlwaysInlineMaxSize = function () {
      return a._BinaryenGetAlwaysInlineMaxSize();
    };
    a.setAlwaysInlineMaxSize = function (b) {
      a._BinaryenSetAlwaysInlineMaxSize(b);
    };
    a.getFlexibleInlineMaxSize = function () {
      return a._BinaryenGetFlexibleInlineMaxSize();
    };
    a.setFlexibleInlineMaxSize = function (b) {
      a._BinaryenSetFlexibleInlineMaxSize(b);
    };
    a.getOneCallerInlineMaxSize = function () {
      return a._BinaryenGetOneCallerInlineMaxSize();
    };
    a.setOneCallerInlineMaxSize = function (b) {
      a._BinaryenSetOneCallerInlineMaxSize(b);
    };
    a.getAllowInliningFunctionsWithLoops = function () {
      return !!a._BinaryenGetAllowInliningFunctionsWithLoops();
    };
    a.setAllowInliningFunctionsWithLoops = function (b) {
      a._BinaryenSetAllowInliningFunctionsWithLoops(b);
    };
    let ef = {};
    const ff = Symbol();
    function Y(b, c) {
      function g(d) {
        if (!(this instanceof g)) return d ? new g(d) : null;
        Z.call(this, d);
      }
      Object.assign(g, Z);
      Object.assign(g, c);
      (g.prototype = Object.create(Z.prototype)).constructor = g;
      gf(g.prototype, c);
      return (ef[b] = g);
    }
    function gf(b, c) {
      Object.keys(c).forEach(g => {
        const d = c[g];
        if ('function' === typeof d) {
          b[g] = function (...h) {
            return this.constructor[g](this[ff], ...h);
          };
          var f;
          if (1 === d.length && (f = g.match(/^(get|is)/))) {
            f = f[1].length;
            const h = g.charAt(f).toLowerCase() + g.substring(f + 1),
              k = c['set' + g.substring(f)];
            Object.defineProperty(b, h, {
              get() {
                return d(this[ff]);
              },
              set(l) {
                if (k) k(this[ff], l);
                else throw Error("property '" + h + "' has no setter");
              },
            });
          }
        }
      });
    }
    function Z(b) {
      if (!(this instanceof Z)) {
        if (!b) return null;
        const c = a._BinaryenExpressionGetId(b);
        return ef[c](b);
      }
      if (!b) throw Error('expression reference must not be null');
      this[ff] = b;
    }
    Z.getId = function (b) {
      return a._BinaryenExpressionGetId(b);
    };
    Z.getType = function (b) {
      return a._BinaryenExpressionGetType(b);
    };
    Z.setType = function (b, c) {
      a._BinaryenExpressionSetType(b, c);
    };
    Z.finalize = function (b) {
      return a._BinaryenExpressionFinalize(b);
    };
    Z.toText = function (b) {
      return a.emitText(b);
    };
    gf(Z.prototype, Z);
    Z.prototype.valueOf = function () {
      return this[ff];
    };
    a.Expression = Z;
    a.Block = Y(a._BinaryenBlockId(), {
      getName: function (b) {
        return (b = a._BinaryenBlockGetName(b)) ? (b ? y(u, b) : '') : null;
      },
      setName: function (b, c) {
        S(() => {
          a._BinaryenBlockSetName(b, T(c));
        });
      },
      getNumChildren: function (b) {
        return a._BinaryenBlockGetNumChildren(b);
      },
      getChildren: function (b) {
        return V(b, a._BinaryenBlockGetNumChildren, a._BinaryenBlockGetChildAt);
      },
      setChildren: function (b, c) {
        W(
          b,
          c,
          a._BinaryenBlockGetNumChildren,
          a._BinaryenBlockSetChildAt,
          a._BinaryenBlockAppendChild,
          a._BinaryenBlockRemoveChildAt
        );
      },
      getChildAt: function (b, c) {
        return a._BinaryenBlockGetChildAt(b, c);
      },
      setChildAt: function (b, c, g) {
        a._BinaryenBlockSetChildAt(b, c, g);
      },
      appendChild: function (b, c) {
        return a._BinaryenBlockAppendChild(b, c);
      },
      insertChildAt: function (b, c, g) {
        a._BinaryenBlockInsertChildAt(b, c, g);
      },
      removeChildAt: function (b, c) {
        return a._BinaryenBlockRemoveChildAt(b, c);
      },
    });
    a.If = Y(a._BinaryenIfId(), {
      getCondition: function (b) {
        return a._BinaryenIfGetCondition(b);
      },
      setCondition: function (b, c) {
        a._BinaryenIfSetCondition(b, c);
      },
      getIfTrue: function (b) {
        return a._BinaryenIfGetIfTrue(b);
      },
      setIfTrue: function (b, c) {
        a._BinaryenIfSetIfTrue(b, c);
      },
      getIfFalse: function (b) {
        return a._BinaryenIfGetIfFalse(b);
      },
      setIfFalse: function (b, c) {
        a._BinaryenIfSetIfFalse(b, c);
      },
    });
    a.Loop = Y(a._BinaryenLoopId(), {
      getName: function (b) {
        return (b = a._BinaryenLoopGetName(b)) ? (b ? y(u, b) : '') : null;
      },
      setName: function (b, c) {
        S(() => {
          a._BinaryenLoopSetName(b, T(c));
        });
      },
      getBody: function (b) {
        return a._BinaryenLoopGetBody(b);
      },
      setBody: function (b, c) {
        a._BinaryenLoopSetBody(b, c);
      },
    });
    a.Break = Y(a._BinaryenBreakId(), {
      getName: function (b) {
        return (b = a._BinaryenBreakGetName(b)) ? (b ? y(u, b) : '') : null;
      },
      setName: function (b, c) {
        S(() => {
          a._BinaryenBreakSetName(b, T(c));
        });
      },
      getCondition: function (b) {
        return a._BinaryenBreakGetCondition(b);
      },
      setCondition: function (b, c) {
        a._BinaryenBreakSetCondition(b, c);
      },
      getValue: function (b) {
        return a._BinaryenBreakGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenBreakSetValue(b, c);
      },
    });
    a.Switch = Y(a._BinaryenSwitchId(), {
      getNumNames: function (b) {
        return a._BinaryenSwitchGetNumNames(b);
      },
      getNames: function (b) {
        return V(b, a._BinaryenSwitchGetNumNames, a._BinaryenSwitchGetNameAt).map(c =>
          c ? y(u, c) : ''
        );
      },
      setNames: function (b, c) {
        S(() => {
          W(
            b,
            c.map(T),
            a._BinaryenSwitchGetNumNames,
            a._BinaryenSwitchSetNameAt,
            a._BinaryenSwitchAppendName,
            a._BinaryenSwitchRemoveNameAt
          );
        });
      },
      getDefaultName: function (b) {
        return (b = a._BinaryenSwitchGetDefaultName(b)) ? (b ? y(u, b) : '') : null;
      },
      setDefaultName: function (b, c) {
        S(() => {
          a._BinaryenSwitchSetDefaultName(b, T(c));
        });
      },
      getCondition: function (b) {
        return a._BinaryenSwitchGetCondition(b);
      },
      setCondition: function (b, c) {
        a._BinaryenSwitchSetCondition(b, c);
      },
      getValue: function (b) {
        return a._BinaryenSwitchGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenSwitchSetValue(b, c);
      },
      getNameAt: function (b, c) {
        return I(a._BinaryenSwitchGetNameAt(b, c));
      },
      setNameAt: function (b, c, g) {
        S(() => {
          a._BinaryenSwitchSetNameAt(b, c, T(g));
        });
      },
      appendName: function (b, c) {
        S(() => a._BinaryenSwitchAppendName(b, T(c)));
      },
      insertNameAt: function (b, c, g) {
        S(() => {
          a._BinaryenSwitchInsertNameAt(b, c, T(g));
        });
      },
      removeNameAt: function (b, c) {
        return I(a._BinaryenSwitchRemoveNameAt(b, c));
      },
    });
    a.Call = Y(a._BinaryenCallId(), {
      getTarget: function (b) {
        return I(a._BinaryenCallGetTarget(b));
      },
      setTarget: function (b, c) {
        S(() => {
          a._BinaryenCallSetTarget(b, T(c));
        });
      },
      getNumOperands: function (b) {
        return a._BinaryenCallGetNumOperands(b);
      },
      getOperands: function (b) {
        return V(b, a._BinaryenCallGetNumOperands, a._BinaryenCallGetOperandAt);
      },
      setOperands: function (b, c) {
        W(
          b,
          c,
          a._BinaryenCallGetNumOperands,
          a._BinaryenCallSetOperandAt,
          a._BinaryenCallAppendOperand,
          a._BinaryenCallRemoveOperandAt
        );
      },
      getOperandAt: function (b, c) {
        return a._BinaryenCallGetOperandAt(b, c);
      },
      setOperandAt: function (b, c, g) {
        a._BinaryenCallSetOperandAt(b, c, g);
      },
      appendOperand: function (b, c) {
        return a._BinaryenCallAppendOperand(b, c);
      },
      insertOperandAt: function (b, c, g) {
        a._BinaryenCallInsertOperandAt(b, c, g);
      },
      removeOperandAt: function (b, c) {
        return a._BinaryenCallRemoveOperandAt(b, c);
      },
      isReturn: function (b) {
        return !!a._BinaryenCallIsReturn(b);
      },
      setReturn: function (b, c) {
        a._BinaryenCallSetReturn(b, c);
      },
    });
    a.CallIndirect = Y(a._BinaryenCallIndirectId(), {
      getTarget: function (b) {
        return a._BinaryenCallIndirectGetTarget(b);
      },
      setTarget: function (b, c) {
        a._BinaryenCallIndirectSetTarget(b, c);
      },
      getTable: function (b) {
        return I(a._BinaryenCallIndirectGetTable(b));
      },
      setTable: function (b, c) {
        S(() => {
          a._BinaryenCallIndirectSetTable(b, T(c));
        });
      },
      getNumOperands: function (b) {
        return a._BinaryenCallIndirectGetNumOperands(b);
      },
      getOperands: function (b) {
        return V(b, a._BinaryenCallIndirectGetNumOperands, a._BinaryenCallIndirectGetOperandAt);
      },
      setOperands: function (b, c) {
        W(
          b,
          c,
          a._BinaryenCallIndirectGetNumOperands,
          a._BinaryenCallIndirectSetOperandAt,
          a._BinaryenCallIndirectAppendOperand,
          a._BinaryenCallIndirectRemoveOperandAt
        );
      },
      getOperandAt: function (b, c) {
        return a._BinaryenCallIndirectGetOperandAt(b, c);
      },
      setOperandAt: function (b, c, g) {
        a._BinaryenCallIndirectSetOperandAt(b, c, g);
      },
      appendOperand: function (b, c) {
        return a._BinaryenCallIndirectAppendOperand(b, c);
      },
      insertOperandAt: function (b, c, g) {
        a._BinaryenCallIndirectInsertOperandAt(b, c, g);
      },
      removeOperandAt: function (b, c) {
        return a._BinaryenCallIndirectRemoveOperandAt(b, c);
      },
      isReturn: function (b) {
        return !!a._BinaryenCallIndirectIsReturn(b);
      },
      setReturn: function (b, c) {
        a._BinaryenCallIndirectSetReturn(b, c);
      },
      getParams: function (b) {
        return a._BinaryenCallIndirectGetParams(b);
      },
      setParams: function (b, c) {
        a._BinaryenCallIndirectSetParams(b, c);
      },
      getResults: function (b) {
        return a._BinaryenCallIndirectGetResults(b);
      },
      setResults: function (b, c) {
        a._BinaryenCallIndirectSetResults(b, c);
      },
    });
    a.LocalGet = Y(a._BinaryenLocalGetId(), {
      getIndex: function (b) {
        return a._BinaryenLocalGetGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenLocalGetSetIndex(b, c);
      },
    });
    a.LocalSet = Y(a._BinaryenLocalSetId(), {
      getIndex: function (b) {
        return a._BinaryenLocalSetGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenLocalSetSetIndex(b, c);
      },
      isTee: function (b) {
        return !!a._BinaryenLocalSetIsTee(b);
      },
      getValue: function (b) {
        return a._BinaryenLocalSetGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenLocalSetSetValue(b, c);
      },
    });
    a.GlobalGet = Y(a._BinaryenGlobalGetId(), {
      getName: function (b) {
        return I(a._BinaryenGlobalGetGetName(b));
      },
      setName: function (b, c) {
        S(() => {
          a._BinaryenGlobalGetSetName(b, T(c));
        });
      },
    });
    a.GlobalSet = Y(a._BinaryenGlobalSetId(), {
      getName: function (b) {
        return I(a._BinaryenGlobalSetGetName(b));
      },
      setName: function (b, c) {
        S(() => {
          a._BinaryenGlobalSetSetName(b, T(c));
        });
      },
      getValue: function (b) {
        return a._BinaryenGlobalSetGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenGlobalSetSetValue(b, c);
      },
    });
    a.TableGet = Y(a._BinaryenTableGetId(), {
      getTable: function (b) {
        return I(a._BinaryenTableGetGetTable(b));
      },
      setTable: function (b, c) {
        S(() => {
          a._BinaryenTableGetSetTable(b, T(c));
        });
      },
      getIndex: function (b) {
        return a._BinaryenTableGetGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenTableGetSetIndex(b, c);
      },
    });
    a.TableSet = Y(a._BinaryenTableSetId(), {
      getTable: function (b) {
        return I(a._BinaryenTableSetGetTable(b));
      },
      setTable: function (b, c) {
        S(() => {
          a._BinaryenTableSetSetTable(b, T(c));
        });
      },
      getIndex: function (b) {
        return a._BinaryenTableSetGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenTableSetSetIndex(b, c);
      },
      getValue: function (b) {
        return a._BinaryenTableSetGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenTableSetSetValue(b, c);
      },
    });
    a.TableSize = Y(a._BinaryenTableSizeId(), {
      getTable: function (b) {
        return I(a._BinaryenTableSizeGetTable(b));
      },
      setTable: function (b, c) {
        S(() => {
          a._BinaryenTableSizeSetTable(b, T(c));
        });
      },
    });
    a.TableGrow = Y(a._BinaryenTableGrowId(), {
      getTable: function (b) {
        return I(a._BinaryenTableGrowGetTable(b));
      },
      setTable: function (b, c) {
        S(() => {
          a._BinaryenTableGrowSetTable(b, T(c));
        });
      },
      getValue: function (b) {
        return a._BinaryenTableGrowGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenTableGrowSetValue(b, c);
      },
      getDelta: function (b) {
        return a._BinaryenTableGrowGetDelta(b);
      },
      setDelta: function (b, c) {
        a._BinaryenTableGrowSetDelta(b, c);
      },
    });
    a.MemorySize = Y(a._BinaryenMemorySizeId(), {});
    a.MemoryGrow = Y(a._BinaryenMemoryGrowId(), {
      getDelta: function (b) {
        return a._BinaryenMemoryGrowGetDelta(b);
      },
      setDelta: function (b, c) {
        a._BinaryenMemoryGrowSetDelta(b, c);
      },
    });
    a.Load = Y(a._BinaryenLoadId(), {
      isAtomic: function (b) {
        return !!a._BinaryenLoadIsAtomic(b);
      },
      setAtomic: function (b, c) {
        a._BinaryenLoadSetAtomic(b, c);
      },
      isSigned: function (b) {
        return !!a._BinaryenLoadIsSigned(b);
      },
      setSigned: function (b, c) {
        a._BinaryenLoadSetSigned(b, c);
      },
      getOffset: function (b) {
        return a._BinaryenLoadGetOffset(b);
      },
      setOffset: function (b, c) {
        a._BinaryenLoadSetOffset(b, c);
      },
      getBytes: function (b) {
        return a._BinaryenLoadGetBytes(b);
      },
      setBytes: function (b, c) {
        a._BinaryenLoadSetBytes(b, c);
      },
      getAlign: function (b) {
        return a._BinaryenLoadGetAlign(b);
      },
      setAlign: function (b, c) {
        a._BinaryenLoadSetAlign(b, c);
      },
      getPtr: function (b) {
        return a._BinaryenLoadGetPtr(b);
      },
      setPtr: function (b, c) {
        a._BinaryenLoadSetPtr(b, c);
      },
    });
    a.Store = Y(a._BinaryenStoreId(), {
      isAtomic: function (b) {
        return !!a._BinaryenStoreIsAtomic(b);
      },
      setAtomic: function (b, c) {
        a._BinaryenStoreSetAtomic(b, c);
      },
      getBytes: function (b) {
        return a._BinaryenStoreGetBytes(b);
      },
      setBytes: function (b, c) {
        a._BinaryenStoreSetBytes(b, c);
      },
      getOffset: function (b) {
        return a._BinaryenStoreGetOffset(b);
      },
      setOffset: function (b, c) {
        a._BinaryenStoreSetOffset(b, c);
      },
      getAlign: function (b) {
        return a._BinaryenStoreGetAlign(b);
      },
      setAlign: function (b, c) {
        a._BinaryenStoreSetAlign(b, c);
      },
      getPtr: function (b) {
        return a._BinaryenStoreGetPtr(b);
      },
      setPtr: function (b, c) {
        a._BinaryenStoreSetPtr(b, c);
      },
      getValue: function (b) {
        return a._BinaryenStoreGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenStoreSetValue(b, c);
      },
      getValueType: function (b) {
        return a._BinaryenStoreGetValueType(b);
      },
      setValueType: function (b, c) {
        a._BinaryenStoreSetValueType(b, c);
      },
    });
    a.Const = Y(a._BinaryenConstId(), {
      getValueI32: function (b) {
        return a._BinaryenConstGetValueI32(b);
      },
      setValueI32: function (b, c) {
        a._BinaryenConstSetValueI32(b, c);
      },
      getValueI64Low: function (b) {
        return a._BinaryenConstGetValueI64Low(b);
      },
      setValueI64Low: function (b, c) {
        a._BinaryenConstSetValueI64Low(b, c);
      },
      getValueI64High: function (b) {
        return a._BinaryenConstGetValueI64High(b);
      },
      setValueI64High: function (b, c) {
        a._BinaryenConstSetValueI64High(b, c);
      },
      getValueF32: function (b) {
        return a._BinaryenConstGetValueF32(b);
      },
      setValueF32: function (b, c) {
        a._BinaryenConstSetValueF32(b, c);
      },
      getValueF64: function (b) {
        return a._BinaryenConstGetValueF64(b);
      },
      setValueF64: function (b, c) {
        a._BinaryenConstSetValueF64(b, c);
      },
      getValueV128: function (b) {
        let c;
        S(() => {
          const g = L(16);
          a._BinaryenConstGetValueV128(b, g);
          c = Array(16);
          for (let d = 0; 16 > d; ++d) c[d] = u[g + d];
        });
        return c;
      },
      setValueV128: function (b, c) {
        S(() => {
          const g = L(16);
          for (let d = 0; 16 > d; ++d) u[g + d] = c[d];
          a._BinaryenConstSetValueV128(b, g);
        });
      },
    });
    a.Unary = Y(a._BinaryenUnaryId(), {
      getOp: function (b) {
        return a._BinaryenUnaryGetOp(b);
      },
      setOp: function (b, c) {
        a._BinaryenUnarySetOp(b, c);
      },
      getValue: function (b) {
        return a._BinaryenUnaryGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenUnarySetValue(b, c);
      },
    });
    a.Binary = Y(a._BinaryenBinaryId(), {
      getOp: function (b) {
        return a._BinaryenBinaryGetOp(b);
      },
      setOp: function (b, c) {
        a._BinaryenBinarySetOp(b, c);
      },
      getLeft: function (b) {
        return a._BinaryenBinaryGetLeft(b);
      },
      setLeft: function (b, c) {
        a._BinaryenBinarySetLeft(b, c);
      },
      getRight: function (b) {
        return a._BinaryenBinaryGetRight(b);
      },
      setRight: function (b, c) {
        a._BinaryenBinarySetRight(b, c);
      },
    });
    a.Select = Y(a._BinaryenSelectId(), {
      getIfTrue: function (b) {
        return a._BinaryenSelectGetIfTrue(b);
      },
      setIfTrue: function (b, c) {
        a._BinaryenSelectSetIfTrue(b, c);
      },
      getIfFalse: function (b) {
        return a._BinaryenSelectGetIfFalse(b);
      },
      setIfFalse: function (b, c) {
        a._BinaryenSelectSetIfFalse(b, c);
      },
      getCondition: function (b) {
        return a._BinaryenSelectGetCondition(b);
      },
      setCondition: function (b, c) {
        a._BinaryenSelectSetCondition(b, c);
      },
    });
    a.Drop = Y(a._BinaryenDropId(), {
      getValue: function (b) {
        return a._BinaryenDropGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenDropSetValue(b, c);
      },
    });
    a.Return = Y(a._BinaryenReturnId(), {
      getValue: function (b) {
        return a._BinaryenReturnGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenReturnSetValue(b, c);
      },
    });
    a.AtomicRMW = Y(a._BinaryenAtomicRMWId(), {
      getOp: function (b) {
        return a._BinaryenAtomicRMWGetOp(b);
      },
      setOp: function (b, c) {
        a._BinaryenAtomicRMWSetOp(b, c);
      },
      getBytes: function (b) {
        return a._BinaryenAtomicRMWGetBytes(b);
      },
      setBytes: function (b, c) {
        a._BinaryenAtomicRMWSetBytes(b, c);
      },
      getOffset: function (b) {
        return a._BinaryenAtomicRMWGetOffset(b);
      },
      setOffset: function (b, c) {
        a._BinaryenAtomicRMWSetOffset(b, c);
      },
      getPtr: function (b) {
        return a._BinaryenAtomicRMWGetPtr(b);
      },
      setPtr: function (b, c) {
        a._BinaryenAtomicRMWSetPtr(b, c);
      },
      getValue: function (b) {
        return a._BinaryenAtomicRMWGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenAtomicRMWSetValue(b, c);
      },
    });
    a.AtomicCmpxchg = Y(a._BinaryenAtomicCmpxchgId(), {
      getBytes: function (b) {
        return a._BinaryenAtomicCmpxchgGetBytes(b);
      },
      setBytes: function (b, c) {
        a._BinaryenAtomicCmpxchgSetBytes(b, c);
      },
      getOffset: function (b) {
        return a._BinaryenAtomicCmpxchgGetOffset(b);
      },
      setOffset: function (b, c) {
        a._BinaryenAtomicCmpxchgSetOffset(b, c);
      },
      getPtr: function (b) {
        return a._BinaryenAtomicCmpxchgGetPtr(b);
      },
      setPtr: function (b, c) {
        a._BinaryenAtomicCmpxchgSetPtr(b, c);
      },
      getExpected: function (b) {
        return a._BinaryenAtomicCmpxchgGetExpected(b);
      },
      setExpected: function (b, c) {
        a._BinaryenAtomicCmpxchgSetExpected(b, c);
      },
      getReplacement: function (b) {
        return a._BinaryenAtomicCmpxchgGetReplacement(b);
      },
      setReplacement: function (b, c) {
        a._BinaryenAtomicCmpxchgSetReplacement(b, c);
      },
    });
    a.AtomicWait = Y(a._BinaryenAtomicWaitId(), {
      getPtr: function (b) {
        return a._BinaryenAtomicWaitGetPtr(b);
      },
      setPtr: function (b, c) {
        a._BinaryenAtomicWaitSetPtr(b, c);
      },
      getExpected: function (b) {
        return a._BinaryenAtomicWaitGetExpected(b);
      },
      setExpected: function (b, c) {
        a._BinaryenAtomicWaitSetExpected(b, c);
      },
      getTimeout: function (b) {
        return a._BinaryenAtomicWaitGetTimeout(b);
      },
      setTimeout: function (b, c) {
        a._BinaryenAtomicWaitSetTimeout(b, c);
      },
      getExpectedType: function (b) {
        return a._BinaryenAtomicWaitGetExpectedType(b);
      },
      setExpectedType: function (b, c) {
        a._BinaryenAtomicWaitSetExpectedType(b, c);
      },
    });
    a.AtomicNotify = Y(a._BinaryenAtomicNotifyId(), {
      getPtr: function (b) {
        return a._BinaryenAtomicNotifyGetPtr(b);
      },
      setPtr: function (b, c) {
        a._BinaryenAtomicNotifySetPtr(b, c);
      },
      getNotifyCount: function (b) {
        return a._BinaryenAtomicNotifyGetNotifyCount(b);
      },
      setNotifyCount: function (b, c) {
        a._BinaryenAtomicNotifySetNotifyCount(b, c);
      },
    });
    a.AtomicFence = Y(a._BinaryenAtomicFenceId(), {
      getOrder: function (b) {
        return a._BinaryenAtomicFenceGetOrder(b);
      },
      setOrder: function (b, c) {
        a._BinaryenAtomicFenceSetOrder(b, c);
      },
    });
    a.SIMDExtract = Y(a._BinaryenSIMDExtractId(), {
      getOp: function (b) {
        return a._BinaryenSIMDExtractGetOp(b);
      },
      setOp: function (b, c) {
        a._BinaryenSIMDExtractSetOp(b, c);
      },
      getVec: function (b) {
        return a._BinaryenSIMDExtractGetVec(b);
      },
      setVec: function (b, c) {
        a._BinaryenSIMDExtractSetVec(b, c);
      },
      getIndex: function (b) {
        return a._BinaryenSIMDExtractGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenSIMDExtractSetIndex(b, c);
      },
    });
    a.SIMDReplace = Y(a._BinaryenSIMDReplaceId(), {
      getOp: function (b) {
        return a._BinaryenSIMDReplaceGetOp(b);
      },
      setOp: function (b, c) {
        a._BinaryenSIMDReplaceSetOp(b, c);
      },
      getVec: function (b) {
        return a._BinaryenSIMDReplaceGetVec(b);
      },
      setVec: function (b, c) {
        a._BinaryenSIMDReplaceSetVec(b, c);
      },
      getIndex: function (b) {
        return a._BinaryenSIMDReplaceGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenSIMDReplaceSetIndex(b, c);
      },
      getValue: function (b) {
        return a._BinaryenSIMDReplaceGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenSIMDReplaceSetValue(b, c);
      },
    });
    a.SIMDShuffle = Y(a._BinaryenSIMDShuffleId(), {
      getLeft: function (b) {
        return a._BinaryenSIMDShuffleGetLeft(b);
      },
      setLeft: function (b, c) {
        a._BinaryenSIMDShuffleSetLeft(b, c);
      },
      getRight: function (b) {
        return a._BinaryenSIMDShuffleGetRight(b);
      },
      setRight: function (b, c) {
        a._BinaryenSIMDShuffleSetRight(b, c);
      },
      getMask: function (b) {
        let c;
        S(() => {
          const g = L(16);
          a._BinaryenSIMDShuffleGetMask(b, g);
          c = Array(16);
          for (let d = 0; 16 > d; ++d) c[d] = u[g + d];
        });
        return c;
      },
      setMask: function (b, c) {
        S(() => {
          const g = L(16);
          for (let d = 0; 16 > d; ++d) u[g + d] = c[d];
          a._BinaryenSIMDShuffleSetMask(b, g);
        });
      },
    });
    a.SIMDTernary = Y(a._BinaryenSIMDTernaryId(), {
      getOp: function (b) {
        return a._BinaryenSIMDTernaryGetOp(b);
      },
      setOp: function (b, c) {
        a._BinaryenSIMDTernarySetOp(b, c);
      },
      getA: function (b) {
        return a._BinaryenSIMDTernaryGetA(b);
      },
      setA: function (b, c) {
        a._BinaryenSIMDTernarySetA(b, c);
      },
      getB: function (b) {
        return a._BinaryenSIMDTernaryGetB(b);
      },
      setB: function (b, c) {
        a._BinaryenSIMDTernarySetB(b, c);
      },
      getC: function (b) {
        return a._BinaryenSIMDTernaryGetC(b);
      },
      setC: function (b, c) {
        a._BinaryenSIMDTernarySetC(b, c);
      },
    });
    a.SIMDShift = Y(a._BinaryenSIMDShiftId(), {
      getOp: function (b) {
        return a._BinaryenSIMDShiftGetOp(b);
      },
      setOp: function (b, c) {
        a._BinaryenSIMDShiftSetOp(b, c);
      },
      getVec: function (b) {
        return a._BinaryenSIMDShiftGetVec(b);
      },
      setVec: function (b, c) {
        a._BinaryenSIMDShiftSetVec(b, c);
      },
      getShift: function (b) {
        return a._BinaryenSIMDShiftGetShift(b);
      },
      setShift: function (b, c) {
        a._BinaryenSIMDShiftSetShift(b, c);
      },
    });
    a.SIMDLoad = Y(a._BinaryenSIMDLoadId(), {
      getOp: function (b) {
        return a._BinaryenSIMDLoadGetOp(b);
      },
      setOp: function (b, c) {
        a._BinaryenSIMDLoadSetOp(b, c);
      },
      getOffset: function (b) {
        return a._BinaryenSIMDLoadGetOffset(b);
      },
      setOffset: function (b, c) {
        a._BinaryenSIMDLoadSetOffset(b, c);
      },
      getAlign: function (b) {
        return a._BinaryenSIMDLoadGetAlign(b);
      },
      setAlign: function (b, c) {
        a._BinaryenSIMDLoadSetAlign(b, c);
      },
      getPtr: function (b) {
        return a._BinaryenSIMDLoadGetPtr(b);
      },
      setPtr: function (b, c) {
        a._BinaryenSIMDLoadSetPtr(b, c);
      },
    });
    a.SIMDLoadStoreLane = Y(a._BinaryenSIMDLoadStoreLaneId(), {
      getOp: function (b) {
        return a._BinaryenSIMDLoadStoreLaneGetOp(b);
      },
      setOp: function (b, c) {
        a._BinaryenSIMDLoadStoreLaneSetOp(b, c);
      },
      getOffset: function (b) {
        return a._BinaryenSIMDLoadStoreLaneGetOffset(b);
      },
      setOffset: function (b, c) {
        a._BinaryenSIMDLoadStoreLaneSetOffset(b, c);
      },
      getAlign: function (b) {
        return a._BinaryenSIMDLoadStoreLaneGetAlign(b);
      },
      setAlign: function (b, c) {
        a._BinaryenSIMDLoadStoreLaneSetAlign(b, c);
      },
      getIndex: function (b) {
        return a._BinaryenSIMDLoadStoreLaneGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenSIMDLoadStoreLaneSetIndex(b, c);
      },
      getPtr: function (b) {
        return a._BinaryenSIMDLoadStoreLaneGetPtr(b);
      },
      setPtr: function (b, c) {
        a._BinaryenSIMDLoadStoreLaneSetPtr(b, c);
      },
      getVec: function (b) {
        return a._BinaryenSIMDLoadStoreLaneGetVec(b);
      },
      setVec: function (b, c) {
        a._BinaryenSIMDLoadStoreLaneSetVec(b, c);
      },
      isStore: function (b) {
        return !!a._BinaryenSIMDLoadStoreLaneIsStore(b);
      },
    });
    a.MemoryInit = Y(a._BinaryenMemoryInitId(), {
      getSegment: function (b) {
        return I(a._BinaryenMemoryInitGetSegment(b));
      },
      setSegment: function (b, c) {
        S(() => a._BinaryenMemoryInitSetSegment(b, T(c)));
      },
      getDest: function (b) {
        return a._BinaryenMemoryInitGetDest(b);
      },
      setDest: function (b, c) {
        a._BinaryenMemoryInitSetDest(b, c);
      },
      getOffset: function (b) {
        return a._BinaryenMemoryInitGetOffset(b);
      },
      setOffset: function (b, c) {
        a._BinaryenMemoryInitSetOffset(b, c);
      },
      getSize: function (b) {
        return a._BinaryenMemoryInitGetSize(b);
      },
      setSize: function (b, c) {
        a._BinaryenMemoryInitSetSize(b, c);
      },
    });
    a.DataDrop = Y(a._BinaryenDataDropId(), {
      getSegment: function (b) {
        return I(a._BinaryenDataDropGetSegment(b));
      },
      setSegment: function (b, c) {
        S(() => a._BinaryenDataDropSetSegment(b, T(c)));
      },
    });
    a.MemoryCopy = Y(a._BinaryenMemoryCopyId(), {
      getDest: function (b) {
        return a._BinaryenMemoryCopyGetDest(b);
      },
      setDest: function (b, c) {
        a._BinaryenMemoryCopySetDest(b, c);
      },
      getSource: function (b) {
        return a._BinaryenMemoryCopyGetSource(b);
      },
      setSource: function (b, c) {
        a._BinaryenMemoryCopySetSource(b, c);
      },
      getSize: function (b) {
        return a._BinaryenMemoryCopyGetSize(b);
      },
      setSize: function (b, c) {
        a._BinaryenMemoryCopySetSize(b, c);
      },
    });
    a.MemoryFill = Y(a._BinaryenMemoryFillId(), {
      getDest: function (b) {
        return a._BinaryenMemoryFillGetDest(b);
      },
      setDest: function (b, c) {
        a._BinaryenMemoryFillSetDest(b, c);
      },
      getValue: function (b) {
        return a._BinaryenMemoryFillGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenMemoryFillSetValue(b, c);
      },
      getSize: function (b) {
        return a._BinaryenMemoryFillGetSize(b);
      },
      setSize: function (b, c) {
        a._BinaryenMemoryFillSetSize(b, c);
      },
    });
    a.RefIsNull = Y(a._BinaryenRefIsNullId(), {
      getValue: function (b) {
        return a._BinaryenRefIsNullGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenRefIsNullSetValue(b, c);
      },
    });
    a.RefAs = Y(a._BinaryenRefAsId(), {
      getOp: function (b) {
        return a._BinaryenRefAsGetOp(b);
      },
      setOp: function (b, c) {
        a._BinaryenRefAsSetOp(b, c);
      },
      getValue: function (b) {
        return a._BinaryenRefAsGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenRefAsSetValue(b, c);
      },
    });
    a.RefFunc = Y(a._BinaryenRefFuncId(), {
      getFunc: function (b) {
        return I(a._BinaryenRefFuncGetFunc(b));
      },
      setFunc: function (b, c) {
        S(() => {
          a._BinaryenRefFuncSetFunc(b, T(c));
        });
      },
    });
    a.RefEq = Y(a._BinaryenRefEqId(), {
      getLeft: function (b) {
        return a._BinaryenRefEqGetLeft(b);
      },
      setLeft: function (b, c) {
        return a._BinaryenRefEqSetLeft(b, c);
      },
      getRight: function (b) {
        return a._BinaryenRefEqGetRight(b);
      },
      setRight: function (b, c) {
        return a._BinaryenRefEqSetRight(b, c);
      },
    });
    a.RefTest = Y(a._BinaryenRefTestId(), {
      getRef: function (b) {
        return a._BinaryenRefTestGetRef(b);
      },
      setRef: function (b, c) {
        a._BinaryenRefTestSetRef(b, c);
      },
      getCastType: function (b) {
        return a._BinaryenRefTestGetCastType(b);
      },
      setCastType: function (b, c) {
        a._BinaryenRefTestSetCastType(b, c);
      },
    });
    a.RefCast = Y(a._BinaryenRefCastId(), {
      getRef: function (b) {
        return a._BinaryenRefCastGetRef(b);
      },
      setRef: function (b, c) {
        a._BinaryenRefCastSetRef(b, c);
      },
    });
    a.BrOn = Y(a._BinaryenBrOnId(), {
      getOp: function (b) {
        return a._BinaryenBrOnGetOp(b);
      },
      setOp: function (b, c) {
        a._BinaryenBrOnSetOp(b, c);
      },
      getName: function (b) {
        return I(a._BinaryenBrOnGetName(b));
      },
      setName: function (b, c) {
        S(() => a._BinaryenBrOnSetName(b, T(c)));
      },
      getRef: function (b) {
        return a._BinaryenBrOnGetRef(b);
      },
      setRef: function (b, c) {
        a._BinaryenBrOnSetRef(b, c);
      },
      getCastType: function (b) {
        return a._BinaryenBrOnGetCastType(b);
      },
      setCastType: function (b, c) {
        a._BinaryenBrOnSetCastType(b, c);
      },
    });
    a.StructNew = Y(a._BinaryenStructNewId(), {
      getNumOperands: function (b) {
        return a._BinaryenStructNewGetNumOperands(b);
      },
      getOperands: function (b) {
        return V(b, a._BinaryenStructNewGetNumOperands, a._BinaryenStructNewGetOperandAt);
      },
      setOperands: function (b, c) {
        W(
          b,
          c,
          a._BinaryenStructNewGetNumOperands,
          a._BinaryenStructNewSetOperandAt,
          a._BinaryenStructNewAppendOperand,
          a._BinaryenStructNewRemoveOperandAt
        );
      },
      getOperandAt: function (b, c) {
        return a._BinaryenStructNewGetOperandAt(b, c);
      },
      setOperandAt: function (b, c, g) {
        a._BinaryenStructNewSetOperandAt(b, c, g);
      },
      appendOperand: function (b, c) {
        return a._BinaryenStructNewAppendOperand(b, c);
      },
      insertOperandAt: function (b, c, g) {
        a._BinaryenStructNewInsertOperandAt(b, c, g);
      },
      removeOperandAt: function (b, c) {
        return a._BinaryenStructNewRemoveOperandAt(b, c);
      },
    });
    a.StructGet = Y(a._BinaryenStructGetId(), {
      getIndex: function (b) {
        return a._BinaryenStructGetGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenStructGetSetIndex(b, c);
      },
      getRef: function (b) {
        return a._BinaryenStructGetGetRef(b);
      },
      setRef: function (b, c) {
        a._BinaryenStructGetSetRef(b, c);
      },
      isSigned: function (b) {
        return !!a._BinaryenStructGetIsSigned(b);
      },
      setSigned: function (b, c) {
        a._BinaryenStructGetSetSigned(b, c);
      },
    });
    a.StructSet = Y(a._BinaryenStructSetId(), {
      getIndex: function (b) {
        return a._BinaryenStructSetGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenStructSetSetIndex(b, c);
      },
      getRef: function (b) {
        return a._BinaryenStructSetGetRef(b);
      },
      setRef: function (b, c) {
        a._BinaryenStructSetSetRef(b, c);
      },
      getValue: function (b) {
        return a._BinaryenStructSetGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenStructSetSetValue(b, c);
      },
    });
    a.ArrayNew = Y(a._BinaryenArrayNewId(), {
      getInit: function (b) {
        return a._BinaryenArrayNewGetInit(b);
      },
      setInit: function (b, c) {
        a._BinaryenArrayNewSetInit(b, c);
      },
      getSize: function (b) {
        return a._BinaryenArrayNewGetSize(b);
      },
      setSize: function (b, c) {
        a._BinaryenArrayNewSetSize(b, c);
      },
    });
    a.ArrayNewFixed = Y(a._BinaryenArrayNewFixedId(), {
      getNumValues: function (b) {
        return a._BinaryenArrayNewFixedGetNumValues(b);
      },
      getValues: function (b) {
        return V(b, a._BinaryenArrayNewFixedGetNumValues, a._BinaryenArrayNewFixedGetValueAt);
      },
      setValues: function (b, c) {
        W(
          b,
          c,
          a._BinaryenArrayNewFixedGetNumValues,
          a._BinaryenArrayNewFixedSetValueAt,
          a._BinaryenArrayNewFixedAppendValue,
          a._BinaryenArrayNewFixedRemoveValueAt
        );
      },
      getValueAt: function (b, c) {
        return a._BinaryenArrayNewFixedGetValueAt(b, c);
      },
      setValueAt: function (b, c, g) {
        a._BinaryenArrayNewFixedSetValueAt(b, c, g);
      },
      appendValue: function (b, c) {
        return a._BinaryenArrayNewFixedAppendValue(b, c);
      },
      insertValueAt: function (b, c, g) {
        a._BinaryenArrayNewFixedInsertValueAt(b, c, g);
      },
      removeValueAt: function (b, c) {
        return a._BinaryenArrayNewFixedRemoveValueAt(b, c);
      },
    });
    a.ArrayNewData = Y(a._BinaryenArrayNewDataId(), {
      getSegment: function (b) {
        return I(a._BinaryenArrayNewDataGetSegment(b));
      },
      setSegment: function (b, c) {
        S(() => a._BinaryenArrayNewDataSetSegment(b, T(c)));
      },
      getOffset: function (b) {
        return a._BinaryenArrayNewDataGetOffset(b);
      },
      setOffset: function (b, c) {
        a._BinaryenArrayNewDataSetOffset(b, c);
      },
      getSize: function (b) {
        return a._BinaryenArrayNewDataGetSize(b);
      },
      setSize: function (b, c) {
        a._BinaryenArrayNewDataSetSize(b, c);
      },
    });
    a.ArrayNewElem = Y(a._BinaryenArrayNewElemId(), {
      getSegment: function (b) {
        return I(a._BinaryenArrayNewElemGetSegment(b));
      },
      setSegment: function (b, c) {
        S(() => a._BinaryenArrayNewElemSetSegment(b, T(c)));
      },
      getOffset: function (b) {
        return a._BinaryenArrayNewElemGetOffset(b);
      },
      setOffset: function (b, c) {
        a._BinaryenArrayNewElemSetOffset(b, c);
      },
      getSize: function (b) {
        return a._BinaryenArrayNewElemGetSize(b);
      },
      setSize: function (b, c) {
        a._BinaryenArrayNewElemSetSize(b, c);
      },
    });
    a.ArrayGet = Y(a._BinaryenArrayGetId(), {
      getRef: function (b) {
        return a._BinaryenArrayGetGetRef(b);
      },
      setRef: function (b, c) {
        a._BinaryenArrayGetSetRef(b, c);
      },
      getIndex: function (b) {
        return a._BinaryenArrayGetGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenArrayGetSetIndex(b, c);
      },
      isSigned: function (b) {
        return !!a._BinaryenArrayGetIsSigned(b);
      },
      setSigned: function (b, c) {
        a._BinaryenArrayGetSetSigned(b, c);
      },
    });
    a.ArraySet = Y(a._BinaryenArraySetId(), {
      getRef: function (b) {
        return a._BinaryenArraySetGetRef(b);
      },
      setRef: function (b, c) {
        a._BinaryenArraySetSetRef(b, c);
      },
      getIndex: function (b) {
        return a._BinaryenArraySetGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenArraySetSetIndex(b, c);
      },
      getValue: function (b) {
        return a._BinaryenArraySetGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenArraySetSetValue(b, c);
      },
    });
    a.ArrayLen = Y(a._BinaryenArrayLenId(), {
      getRef: function (b) {
        return a._BinaryenArrayLenGetRef(b);
      },
      setRef: function (b, c) {
        a._BinaryenArrayLenSetRef(b, c);
      },
    });
    a.ArrayFill = Y(a._BinaryenArrayFillId(), {
      getRef: function (b) {
        return a._BinaryenArrayFillGetRef(b);
      },
      setRef: function (b, c) {
        a._BinaryenArrayFillSetRef(b, c);
      },
      getIndex: function (b) {
        return a._BinaryenArrayFillGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenArrayFillSetIndex(b, c);
      },
      getValue: function (b) {
        return a._BinaryenArrayFillGetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenArrayFillSetValue(b, c);
      },
      getSize: function (b) {
        return a._BinaryenArrayFillGetSize(b);
      },
      setSize: function (b, c) {
        a._BinaryenArrayFillSetSize(b, c);
      },
    });
    a.ArrayCopy = Y(a._BinaryenArrayCopyId(), {
      getDestRef: function (b) {
        return a._BinaryenArrayCopyGetDestRef(b);
      },
      setDestRef: function (b, c) {
        a._BinaryenArrayCopySetDestRef(b, c);
      },
      getDestIndex: function (b) {
        return a._BinaryenArrayCopyGetDestIndex(b);
      },
      setDestIndex: function (b, c) {
        a._BinaryenArrayCopySetDestIndex(b, c);
      },
      getSrcRef: function (b) {
        return a._BinaryenArrayCopyGetSrcRef(b);
      },
      setSrcRef: function (b, c) {
        a._BinaryenArrayCopySetSrcRef(b, c);
      },
      getSrcIndex: function (b) {
        return a._BinaryenArrayCopyGetSrcIndex(b);
      },
      setSrcIndex: function (b, c) {
        a._BinaryenArrayCopySetSrcIndex(b, c);
      },
      getLength: function (b) {
        return a._BinaryenArrayCopyGetLength(b);
      },
      setLength: function (b, c) {
        a._BinaryenArrayCopySetLength(b, c);
      },
    });
    a.ArrayInitData = Y(a._BinaryenArrayInitDataId(), {
      getSegment: function (b) {
        return I(a._BinaryenArrayInitDataGetSegment(b));
      },
      setSegment: function (b, c) {
        S(() => a._BinaryenArrayInitDataSetSegment(b, T(c)));
      },
      getRef: function (b) {
        return a._BinaryenArrayInitDataGetRef(b);
      },
      setRef: function (b, c) {
        a._BinaryenArrayInitDataSetRef(b, c);
      },
      getIndex: function (b) {
        return a._BinaryenArrayInitDataGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenArrayInitDataSetIndex(b, c);
      },
      getOffset: function (b) {
        return a._BinaryenArrayInitDataGetOffset(b);
      },
      setOffset: function (b, c) {
        a._BinaryenArrayInitDataSetOffset(b, c);
      },
      getSize: function (b) {
        return a._BinaryenArrayInitDataGetSize(b);
      },
      setSize: function (b, c) {
        a._BinaryenArrayInitDataSetSize(b, c);
      },
    });
    a.ArrayInitElem = Y(a._BinaryenArrayInitElemId(), {
      getSegment: function (b) {
        return I(a._BinaryenArrayInitElemGetSegment(b));
      },
      setSegment: function (b, c) {
        S(() => a._BinaryenArrayInitElemSetSegment(b, T(c)));
      },
      getRef: function (b) {
        return a._BinaryenArrayInitElemGetRef(b);
      },
      setRef: function (b, c) {
        a._BinaryenArrayInitElemSetRef(b, c);
      },
      getIndex: function (b) {
        return a._BinaryenArrayInitElemGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenArrayInitElemSetIndex(b, c);
      },
      getOffset: function (b) {
        return a._BinaryenArrayInitElemGetOffset(b);
      },
      setOffset: function (b, c) {
        a._BinaryenArrayInitElemSetOffset(b, c);
      },
      getSize: function (b) {
        return a._BinaryenArrayInitElemGetSize(b);
      },
      setSize: function (b, c) {
        a._BinaryenArrayInitElemSetSize(b, c);
      },
    });
    a.Try = Y(a._BinaryenTryId(), {
      getName: function (b) {
        return (b = a._BinaryenTryGetName(b)) ? (b ? y(u, b) : '') : null;
      },
      setName: function (b, c) {
        S(() => {
          a._BinaryenTrySetName(b, T(c));
        });
      },
      getBody: function (b) {
        return a._BinaryenTryGetBody(b);
      },
      setBody: function (b, c) {
        a._BinaryenTrySetBody(b, c);
      },
      getNumCatchTags: function (b) {
        return a._BinaryenTryGetNumCatchTags(b);
      },
      getCatchTags: function (b) {
        return V(b, a._BinaryenTryGetNumCatchTags, a._BinaryenTryGetCatchTagAt).map(c =>
          c ? y(u, c) : ''
        );
      },
      setCatchTags: function (b, c) {
        S(() => {
          W(
            b,
            c.map(T),
            a._BinaryenTryGetNumCatchTags,
            a._BinaryenTrySetCatchTagAt,
            a._BinaryenTryAppendCatchTag,
            a._BinaryenTryRemoveCatchTagAt
          );
        });
      },
      getCatchTagAt: function (b, c) {
        return I(a._BinaryenTryGetCatchTagAt(b, c));
      },
      setCatchTagAt: function (b, c, g) {
        S(() => {
          a._BinaryenTrySetCatchTagAt(b, c, T(g));
        });
      },
      appendCatchTag: function (b, c) {
        S(() => a._BinaryenTryAppendCatchTag(b, T(c)));
      },
      insertCatchTagAt: function (b, c, g) {
        S(() => {
          a._BinaryenTryInsertCatchTagAt(b, c, T(g));
        });
      },
      removeCatchTagAt: function (b, c) {
        return I(a._BinaryenTryRemoveCatchTagAt(b, c));
      },
      getNumCatchBodies: function (b) {
        return a._BinaryenTryGetNumCatchBodies(b);
      },
      getCatchBodies: function (b) {
        return V(b, a._BinaryenTryGetNumCatchBodies, a._BinaryenTryGetCatchBodyAt);
      },
      setCatchBodies: function (b, c) {
        W(
          b,
          c,
          a._BinaryenTryGetNumCatchBodies,
          a._BinaryenTrySetCatchBodyAt,
          a._BinaryenTryAppendCatchBody,
          a._BinaryenTryRemoveCatchBodyAt
        );
      },
      getCatchBodyAt: function (b, c) {
        return a._BinaryenTryGetCatchBodyAt(b, c);
      },
      setCatchBodyAt: function (b, c, g) {
        a._BinaryenTrySetCatchBodyAt(b, c, g);
      },
      appendCatchBody: function (b, c) {
        return a._BinaryenTryAppendCatchBody(b, c);
      },
      insertCatchBodyAt: function (b, c, g) {
        a._BinaryenTryInsertCatchBodyAt(b, c, g);
      },
      removeCatchBodyAt: function (b, c) {
        return a._BinaryenTryRemoveCatchBodyAt(b, c);
      },
      hasCatchAll: function (b) {
        return !!a._BinaryenTryHasCatchAll(b);
      },
      getDelegateTarget: function (b) {
        return (b = a._BinaryenTryGetDelegateTarget(b)) ? (b ? y(u, b) : '') : null;
      },
      setDelegateTarget: function (b, c) {
        S(() => {
          a._BinaryenTrySetDelegateTarget(b, T(c));
        });
      },
      isDelegate: function (b) {
        return !!a._BinaryenTryIsDelegate(b);
      },
    });
    a.Throw = Y(a._BinaryenThrowId(), {
      getTag: function (b) {
        return I(a._BinaryenThrowGetTag(b));
      },
      setTag: function (b, c) {
        S(() => {
          a._BinaryenThrowSetTag(b, T(c));
        });
      },
      getNumOperands: function (b) {
        return a._BinaryenThrowGetNumOperands(b);
      },
      getOperands: function (b) {
        return V(b, a._BinaryenThrowGetNumOperands, a._BinaryenThrowGetOperandAt);
      },
      setOperands: function (b, c) {
        W(
          b,
          c,
          a._BinaryenThrowGetNumOperands,
          a._BinaryenThrowSetOperandAt,
          a._BinaryenThrowAppendOperand,
          a._BinaryenThrowRemoveOperandAt
        );
      },
      getOperandAt: function (b, c) {
        return a._BinaryenThrowGetOperandAt(b, c);
      },
      setOperandAt: function (b, c, g) {
        a._BinaryenThrowSetOperandAt(b, c, g);
      },
      appendOperand: function (b, c) {
        return a._BinaryenThrowAppendOperand(b, c);
      },
      insertOperandAt: function (b, c, g) {
        a._BinaryenThrowInsertOperandAt(b, c, g);
      },
      removeOperandAt: function (b, c) {
        return a._BinaryenThrowRemoveOperandAt(b, c);
      },
    });
    a.Rethrow = Y(a._BinaryenRethrowId(), {
      getTarget: function (b) {
        return (b = a._BinaryenRethrowGetTarget(b)) ? (b ? y(u, b) : '') : null;
      },
      setTarget: function (b, c) {
        S(() => {
          a._BinaryenRethrowSetTarget(b, T(c));
        });
      },
    });
    a.TupleMake = Y(a._BinaryenTupleMakeId(), {
      getNumOperands: function (b) {
        return a._BinaryenTupleMakeGetNumOperands(b);
      },
      getOperands: function (b) {
        return V(b, a._BinaryenTupleMakeGetNumOperands, a._BinaryenTupleMakeGetOperandAt);
      },
      setOperands: function (b, c) {
        W(
          b,
          c,
          a._BinaryenTupleMakeGetNumOperands,
          a._BinaryenTupleMakeSetOperandAt,
          a._BinaryenTupleMakeAppendOperand,
          a._BinaryenTupleMakeRemoveOperandAt
        );
      },
      getOperandAt: function (b, c) {
        return a._BinaryenTupleMakeGetOperandAt(b, c);
      },
      setOperandAt: function (b, c, g) {
        a._BinaryenTupleMakeSetOperandAt(b, c, g);
      },
      appendOperand: function (b, c) {
        return a._BinaryenTupleMakeAppendOperand(b, c);
      },
      insertOperandAt: function (b, c, g) {
        a._BinaryenTupleMakeInsertOperandAt(b, c, g);
      },
      removeOperandAt: function (b, c) {
        return a._BinaryenTupleMakeRemoveOperandAt(b, c);
      },
    });
    a.TupleExtract = Y(a._BinaryenTupleExtractId(), {
      getTuple: function (b) {
        return a._BinaryenTupleExtractGetTuple(b);
      },
      setTuple: function (b, c) {
        a._BinaryenTupleExtractSetTuple(b, c);
      },
      getIndex: function (b) {
        return a._BinaryenTupleExtractGetIndex(b);
      },
      setIndex: function (b, c) {
        a._BinaryenTupleExtractSetIndex(b, c);
      },
    });
    a.RefI31 = Y(a._BinaryenRefI31Id(), {
      getValue: function (b) {
        return a._BinaryenRefI31GetValue(b);
      },
      setValue: function (b, c) {
        a._BinaryenRefI31SetValue(b, c);
      },
    });
    a.I31Get = Y(a._BinaryenI31GetId(), {
      getI31: function (b) {
        return a._BinaryenI31GetGetI31(b);
      },
      setI31: function (b, c) {
        a._BinaryenI31GetSetI31(b, c);
      },
      isSigned: function (b) {
        return !!a._BinaryenI31GetIsSigned(b);
      },
      setSigned: function (b, c) {
        a._BinaryenI31GetSetSigned(b, c);
      },
    });
    a.Function = (() => {
      function b(c) {
        if (!(this instanceof b)) return c ? new b(c) : null;
        if (!c) throw Error('function reference must not be null');
        this[ff] = c;
      }
      b.getName = function (c) {
        return I(a._BinaryenFunctionGetName(c));
      };
      b.getType = function (c) {
        return a._BinaryenFunctionGetType(c);
      };
      b.getParams = function (c) {
        return a._BinaryenFunctionGetParams(c);
      };
      b.getResults = function (c) {
        return a._BinaryenFunctionGetResults(c);
      };
      b.getNumVars = function (c) {
        return a._BinaryenFunctionGetNumVars(c);
      };
      b.getVar = function (c, g) {
        return a._BinaryenFunctionGetVar(c, g);
      };
      b.getNumLocals = function (c) {
        return a._BinaryenFunctionGetNumLocals(c);
      };
      b.hasLocalName = function (c, g) {
        return !!a._BinaryenFunctionHasLocalName(c, g);
      };
      b.getLocalName = function (c, g) {
        return I(a._BinaryenFunctionGetLocalName(c, g));
      };
      b.setLocalName = function (c, g, d) {
        S(() => {
          a._BinaryenFunctionSetLocalName(c, g, T(d));
        });
      };
      b.getBody = function (c) {
        return a._BinaryenFunctionGetBody(c);
      };
      b.setBody = function (c, g) {
        a._BinaryenFunctionSetBody(c, g);
      };
      gf(b.prototype, b);
      b.prototype.valueOf = function () {
        return this[ff];
      };
      return b;
    })();
    a.exit = function (b) {
      if (0 != b) throw Error('exiting due to error: ' + b);
    };
    ua
      ? cf()
      : (a.onRuntimeInitialized = (b => () => {
          cf();
          b && b();
        })(a.onRuntimeInitialized));
    moduleRtn = ca;

    return moduleRtn;
  };
})();
export default Binaryen;
