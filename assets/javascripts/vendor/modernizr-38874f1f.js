window.Modernizr=function(e,t,n){function i(e){y.cssText=e}function r(e,t){return i(k.join(e+";")+(t||""))}function s(e,t){return typeof e===t}function o(e,t){return!!~(""+e).indexOf(t)}function a(e,t){for(var i in e){var r=e[i];if(!o(r,"-")&&y[r]!==n)return"pfx"==t?r:!0}return!1}function l(e,t,i){for(var r in e){var o=t[e[r]];if(o!==n)return i===!1?e[r]:s(o,"function")?o.bind(i||t):o}return!1}function c(e,t,n){var i=e.charAt(0).toUpperCase()+e.slice(1),r=(e+" "+T.join(i+" ")+i).split(" ");return s(t,"string")||s(t,"undefined")?a(r,t):(r=(e+" "+E.join(i+" ")+i).split(" "),l(r,t,n))}function u(){p.input=function(n){for(var i=0,r=n.length;r>i;i++)D[n[i]]=!!(n[i]in b);return D.list&&(D.list=!(!t.createElement("datalist")||!e.HTMLDataListElement)),D}("autocomplete autofocus list placeholder max min multiple pattern required step".split(" ")),p.inputtypes=function(e){for(var i,r,s,o=0,a=e.length;a>o;o++)b.setAttribute("type",r=e[o]),i="text"!==b.type,i&&(b.value=x,b.style.cssText="position:absolute;visibility:hidden;",/^range$/.test(r)&&b.style.WebkitAppearance!==n?(_.appendChild(b),s=t.defaultView,i=s.getComputedStyle&&"textfield"!==s.getComputedStyle(b,null).WebkitAppearance&&0!==b.offsetHeight,_.removeChild(b)):/^(search|tel)$/.test(r)||(i=/^(url|email)$/.test(r)?b.checkValidity&&b.checkValidity()===!1:b.value!=x)),S[e[o]]=!!i;return S}("search tel url email datetime date month week time datetime-local number range color".split(" "))}var h,d,f="2.7.1",p={},g=!0,_=t.documentElement,m="modernizr",v=t.createElement(m),y=v.style,b=t.createElement("input"),x=":)",w={}.toString,k=" -webkit- -moz- -o- -ms- ".split(" "),C="Webkit Moz O ms",T=C.split(" "),E=C.toLowerCase().split(" "),N={svg:"http://www.w3.org/2000/svg"},j={},S={},D={},A=[],L=A.slice,q=function(e,n,i,r){var s,o,a,l,c=t.createElement("div"),u=t.body,h=u||t.createElement("body");if(parseInt(i,10))for(;i--;)a=t.createElement("div"),a.id=r?r[i]:m+(i+1),c.appendChild(a);return s=["&#173;",'<style id="s',m,'">',e,"</style>"].join(""),c.id=m,(u?c:h).innerHTML+=s,h.appendChild(c),u||(h.style.background="",h.style.overflow="hidden",l=_.style.overflow,_.style.overflow="hidden",_.appendChild(h)),o=n(c,e),u?c.parentNode.removeChild(c):(h.parentNode.removeChild(h),_.style.overflow=l),!!o},H=function(){function e(e,r){r=r||t.createElement(i[e]||"div"),e="on"+e;var o=e in r;return o||(r.setAttribute||(r=t.createElement("div")),r.setAttribute&&r.removeAttribute&&(r.setAttribute(e,""),o=s(r[e],"function"),s(r[e],"undefined")||(r[e]=n),r.removeAttribute(e))),r=null,o}var i={select:"input",change:"input",submit:"form",reset:"form",error:"img",load:"img",abort:"img"};return e}(),O={}.hasOwnProperty;d=s(O,"undefined")||s(O.call,"undefined")?function(e,t){return t in e&&s(e.constructor.prototype[t],"undefined")}:function(e,t){return O.call(e,t)},Function.prototype.bind||(Function.prototype.bind=function(e){var t=this;if("function"!=typeof t)throw new TypeError;var n=L.call(arguments,1),i=function(){if(this instanceof i){var r=function(){};r.prototype=t.prototype;var s=new r,o=t.apply(s,n.concat(L.call(arguments)));return Object(o)===o?o:s}return t.apply(e,n.concat(L.call(arguments)))};return i}),j.flexbox=function(){return c("flexWrap")},j.canvas=function(){var e=t.createElement("canvas");return!(!e.getContext||!e.getContext("2d"))},j.canvastext=function(){return!(!p.canvas||!s(t.createElement("canvas").getContext("2d").fillText,"function"))},j.webgl=function(){return!!e.WebGLRenderingContext},j.touch=function(){var n;return"ontouchstart"in e||e.DocumentTouch&&t instanceof DocumentTouch?n=!0:q(["@media (",k.join("touch-enabled),("),m,")","{#modernizr{top:9px;position:absolute}}"].join(""),function(e){n=9===e.offsetTop}),n},j.geolocation=function(){return"geolocation"in navigator},j.postmessage=function(){return!!e.postMessage},j.websqldatabase=function(){return!!e.openDatabase},j.indexedDB=function(){return!!c("indexedDB",e)},j.hashchange=function(){return H("hashchange",e)&&(t.documentMode===n||t.documentMode>7)},j.history=function(){return!(!e.history||!history.pushState)},j.draganddrop=function(){var e=t.createElement("div");return"draggable"in e||"ondragstart"in e&&"ondrop"in e},j.websockets=function(){return"WebSocket"in e||"MozWebSocket"in e},j.rgba=function(){return i("background-color:rgba(150,255,150,.5)"),o(y.backgroundColor,"rgba")},j.hsla=function(){return i("background-color:hsla(120,40%,100%,.5)"),o(y.backgroundColor,"rgba")||o(y.backgroundColor,"hsla")},j.multiplebgs=function(){return i("background:url(https://),url(https://),red url(https://)"),/(url\s*\(.*?){3}/.test(y.background)},j.backgroundsize=function(){return c("backgroundSize")},j.borderimage=function(){return c("borderImage")},j.borderradius=function(){return c("borderRadius")},j.boxshadow=function(){return c("boxShadow")},j.textshadow=function(){return""===t.createElement("div").style.textShadow},j.opacity=function(){return r("opacity:.55"),/^0.55$/.test(y.opacity)},j.cssanimations=function(){return c("animationName")},j.csscolumns=function(){return c("columnCount")},j.cssgradients=function(){var e="background-image:",t="gradient(linear,left top,right bottom,from(#9f9),to(white));",n="linear-gradient(left top,#9f9, white);";return i((e+"-webkit- ".split(" ").join(t+e)+k.join(n+e)).slice(0,-e.length)),o(y.backgroundImage,"gradient")},j.cssreflections=function(){return c("boxReflect")},j.csstransforms=function(){return!!c("transform")},j.csstransforms3d=function(){var e=!!c("perspective");return e&&"webkitPerspective"in _.style&&q("@media (transform-3d),(-webkit-transform-3d){#modernizr{left:9px;position:absolute;height:3px;}}",function(t){e=9===t.offsetLeft&&3===t.offsetHeight}),e},j.csstransitions=function(){return c("transition")},j.fontface=function(){var e;return q('@font-face {font-family:"font";src:url("https://")}',function(n,i){var r=t.getElementById("smodernizr"),s=r.sheet||r.styleSheet,o=s?s.cssRules&&s.cssRules[0]?s.cssRules[0].cssText:s.cssText||"":"";e=/src/i.test(o)&&0===o.indexOf(i.split(" ")[0])}),e},j.generatedcontent=function(){var e;return q(["#",m,"{font:0/0 a}#",m,':after{content:"',x,'";visibility:hidden;font:3px/1 a}'].join(""),function(t){e=t.offsetHeight>=3}),e},j.video=function(){var e=t.createElement("video"),n=!1;try{(n=!!e.canPlayType)&&(n=new Boolean(n),n.ogg=e.canPlayType('video/ogg; codecs="theora"').replace(/^no$/,""),n.h264=e.canPlayType('video/mp4; codecs="avc1.42E01E"').replace(/^no$/,""),n.webm=e.canPlayType('video/webm; codecs="vp8, vorbis"').replace(/^no$/,""))}catch(i){}return n},j.audio=function(){var e=t.createElement("audio"),n=!1;try{(n=!!e.canPlayType)&&(n=new Boolean(n),n.ogg=e.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/,""),n.mp3=e.canPlayType("audio/mpeg;").replace(/^no$/,""),n.wav=e.canPlayType('audio/wav; codecs="1"').replace(/^no$/,""),n.m4a=(e.canPlayType("audio/x-m4a;")||e.canPlayType("audio/aac;")).replace(/^no$/,""))}catch(i){}return n},j.localstorage=function(){try{return localStorage.setItem(m,m),localStorage.removeItem(m),!0}catch(e){return!1}},j.sessionstorage=function(){try{return sessionStorage.setItem(m,m),sessionStorage.removeItem(m),!0}catch(e){return!1}},j.webworkers=function(){return!!e.Worker},j.applicationcache=function(){return!!e.applicationCache},j.svg=function(){return!!t.createElementNS&&!!t.createElementNS(N.svg,"svg").createSVGRect},j.inlinesvg=function(){var e=t.createElement("div");return e.innerHTML="<svg/>",(e.firstChild&&e.firstChild.namespaceURI)==N.svg},j.smil=function(){return!!t.createElementNS&&/SVGAnimate/.test(w.call(t.createElementNS(N.svg,"animate")))},j.svgclippaths=function(){return!!t.createElementNS&&/SVGClipPath/.test(w.call(t.createElementNS(N.svg,"clipPath")))};for(var M in j)d(j,M)&&(h=M.toLowerCase(),p[h]=j[M](),A.push((p[h]?"":"no-")+h));return p.input||u(),p.addTest=function(e,t){if("object"==typeof e)for(var i in e)d(e,i)&&p.addTest(i,e[i]);else{if(e=e.toLowerCase(),p[e]!==n)return p;t="function"==typeof t?t():t,"undefined"!=typeof g&&g&&(_.className+=" "+(t?"":"no-")+e),p[e]=t}return p},i(""),v=b=null,function(e,t){function n(e,t){var n=e.createElement("p"),i=e.getElementsByTagName("head")[0]||e.documentElement;return n.innerHTML="x<style>"+t+"</style>",i.insertBefore(n.lastChild,i.firstChild)}function i(){var e=v.elements;return"string"==typeof e?e.split(" "):e}function r(e){var t=m[e[g]];return t||(t={},_++,e[g]=_,m[_]=t),t}function s(e,n,i){if(n||(n=t),u)return n.createElement(e);i||(i=r(n));var s;return s=i.cache[e]?i.cache[e].cloneNode():p.test(e)?(i.cache[e]=i.createElem(e)).cloneNode():i.createElem(e),!s.canHaveChildren||f.test(e)||s.tagUrn?s:i.frag.appendChild(s)}function o(e,n){if(e||(e=t),u)return e.createDocumentFragment();n=n||r(e);for(var s=n.frag.cloneNode(),o=0,a=i(),l=a.length;l>o;o++)s.createElement(a[o]);return s}function a(e,t){t.cache||(t.cache={},t.createElem=e.createElement,t.createFrag=e.createDocumentFragment,t.frag=t.createFrag()),e.createElement=function(n){return v.shivMethods?s(n,e,t):t.createElem(n)},e.createDocumentFragment=Function("h,f","return function(){var n=f.cloneNode(),c=n.createElement;h.shivMethods&&("+i().join().replace(/[\w\-]+/g,function(e){return t.createElem(e),t.frag.createElement(e),'c("'+e+'")'})+");return n}")(v,t.frag)}function l(e){e||(e=t);var i=r(e);return!v.shivCSS||c||i.hasCSS||(i.hasCSS=!!n(e,"article,aside,dialog,figcaption,figure,footer,header,hgroup,main,nav,section{display:block}mark{background:#FF0;color:#000}template{display:none}")),u||a(e,i),e}var c,u,h="3.7.0",d=e.html5||{},f=/^<|^(?:button|map|select|textarea|object|iframe|option|optgroup)$/i,p=/^(?:a|b|code|div|fieldset|h1|h2|h3|h4|h5|h6|i|label|li|ol|p|q|span|strong|style|table|tbody|td|th|tr|ul)$/i,g="_html5shiv",_=0,m={};!function(){try{var e=t.createElement("a");e.innerHTML="<xyz></xyz>",c="hidden"in e,u=1==e.childNodes.length||function(){t.createElement("a");var e=t.createDocumentFragment();return"undefined"==typeof e.cloneNode||"undefined"==typeof e.createDocumentFragment||"undefined"==typeof e.createElement}()}catch(n){c=!0,u=!0}}();var v={elements:d.elements||"abbr article aside audio bdi canvas data datalist details dialog figcaption figure footer header hgroup main mark meter nav output progress section summary template time video",version:h,shivCSS:d.shivCSS!==!1,supportsUnknownElements:u,shivMethods:d.shivMethods!==!1,type:"default",shivDocument:l,createElement:s,createDocumentFragment:o};e.html5=v,l(t)}(this,t),p._version=f,p._prefixes=k,p._domPrefixes=E,p._cssomPrefixes=T,p.hasEvent=H,p.testProp=function(e){return a([e])},p.testAllProps=c,p.testStyles=q,p.prefixed=function(e,t,n){return t?c(e,t,n):c(e,"pfx")},_.className=_.className.replace(/(^|\s)no-js(\s|$)/,"$1$2")+(g?" js "+A.join(" "):""),p}(this,this.document),function(e,t,n){function i(e){return"[object Function]"==_.call(e)}function r(e){return"string"==typeof e}function s(){}function o(e){return!e||"loaded"==e||"complete"==e||"uninitialized"==e}function a(){var e=m.shift();v=1,e?e.t?p(function(){("c"==e.t?d.injectCss:d.injectJs)(e.s,0,e.a,e.x,e.e,1)},0):(e(),a()):v=0}function l(e,n,i,r,s,l,c){function u(t){if(!f&&o(h.readyState)&&(y.r=f=1,!v&&a(),h.onload=h.onreadystatechange=null,t)){"img"!=e&&p(function(){x.removeChild(h)},50);for(var i in E[n])E[n].hasOwnProperty(i)&&E[n][i].onload()}}var c=c||d.errorTimeout,h=t.createElement(e),f=0,_=0,y={t:i,s:n,e:s,a:l,x:c};1===E[n]&&(_=1,E[n]=[]),"object"==e?h.data=n:(h.src=n,h.type=e),h.width=h.height="0",h.onerror=h.onload=h.onreadystatechange=function(){u.call(this,_)},m.splice(r,0,y),"img"!=e&&(_||2===E[n]?(x.insertBefore(h,b?null:g),p(u,c)):E[n].push(h))}function c(e,t,n,i,s){return v=0,t=t||"j",r(e)?l("c"==t?k:w,e,t,this.i++,n,i,s):(m.splice(this.i++,0,e),1==m.length&&a()),this}function u(){var e=d;return e.loader={load:c,i:0},e}var h,d,f=t.documentElement,p=e.setTimeout,g=t.getElementsByTagName("script")[0],_={}.toString,m=[],v=0,y="MozAppearance"in f.style,b=y&&!!t.createRange().compareNode,x=b?f:g.parentNode,f=e.opera&&"[object Opera]"==_.call(e.opera),f=!!t.attachEvent&&!f,w=y?"object":f?"script":"img",k=f?"script":w,C=Array.isArray||function(e){return"[object Array]"==_.call(e)},T=[],E={},N={timeout:function(e,t){return t.length&&(e.timeout=t[0]),e}};d=function(e){function t(e){var t,n,i,e=e.split("!"),r=T.length,s=e.pop(),o=e.length,s={url:s,origUrl:s,prefixes:e};for(n=0;o>n;n++)i=e[n].split("="),(t=N[i.shift()])&&(s=t(s,i));for(n=0;r>n;n++)s=T[n](s);return s}function o(e,r,s,o,a){var l=t(e),c=l.autoCallback;l.url.split(".").pop().split("?").shift(),l.bypass||(r&&(r=i(r)?r:r[e]||r[o]||r[e.split("/").pop().split("?")[0]]),l.instead?l.instead(e,r,s,o,a):(E[l.url]?l.noexec=!0:E[l.url]=1,s.load(l.url,l.forceCSS||!l.forceJS&&"css"==l.url.split(".").pop().split("?").shift()?"c":n,l.noexec,l.attrs,l.timeout),(i(r)||i(c))&&s.load(function(){u(),r&&r(l.origUrl,a,o),c&&c(l.origUrl,a,o),E[l.url]=2})))}function a(e,t){function n(e,n){if(e){if(r(e))n||(h=function(){var e=[].slice.call(arguments);d.apply(this,e),f()}),o(e,h,t,0,c);else if(Object(e)===e)for(l in a=function(){var t,n=0;for(t in e)e.hasOwnProperty(t)&&n++;return n}(),e)e.hasOwnProperty(l)&&(!n&&!--a&&(i(h)?h=function(){var e=[].slice.call(arguments);d.apply(this,e),f()}:h[l]=function(e){return function(){var t=[].slice.call(arguments);e&&e.apply(this,t),f()}}(d[l])),o(e[l],h,t,l,c))}else!n&&f()}var a,l,c=!!e.test,u=e.load||e.both,h=e.callback||s,d=h,f=e.complete||s;n(c?e.yep:e.nope,!!u),u&&n(u)}var l,c,h=this.yepnope.loader;if(r(e))o(e,0,h,0);else if(C(e))for(l=0;l<e.length;l++)c=e[l],r(c)?o(c,0,h,0):C(c)?d(c):Object(c)===c&&a(c,h);else Object(e)===e&&a(e,h)},d.addPrefix=function(e,t){N[e]=t},d.addFilter=function(e){T.push(e)},d.errorTimeout=1e4,null==t.readyState&&t.addEventListener&&(t.readyState="loading",t.addEventListener("DOMContentLoaded",h=function(){t.removeEventListener("DOMContentLoaded",h,0),t.readyState="complete"},0)),e.yepnope=u(),e.yepnope.executeStack=a,e.yepnope.injectJs=function(e,n,i,r,l,c){var u,h,f=t.createElement("script"),r=r||d.errorTimeout;f.src=e;for(h in i)f.setAttribute(h,i[h]);n=c?a:n||s,f.onreadystatechange=f.onload=function(){!u&&o(f.readyState)&&(u=1,n(),f.onload=f.onreadystatechange=null)},p(function(){u||(u=1,n(1))},r),l?f.onload():g.parentNode.insertBefore(f,g)},e.yepnope.injectCss=function(e,n,i,r,o,l){var c,r=t.createElement("link"),n=l?a:n||s;r.href=e,r.rel="stylesheet",r.type="text/css";for(c in i)r.setAttribute(c,i[c]);o||(g.parentNode.insertBefore(r,g),p(n,0))}}(this,document),Modernizr.load=function(){yepnope.apply(window,[].slice.call(arguments,0))};