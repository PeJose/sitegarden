// Style vocabulary borrowed verbatim from the design (v42): paper/speck/fibre filters, watercolour filters, symbols, night colour matrices.
// Geometry is never here; see render.ts.
export const DEFS = {
light: `<filter id="tone" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="3" seed="9"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.6  0 0 0 0 0.5  0 0 0 0 0.35  0.5 0 0 0 -0.2"/>
      </filter>
      <filter id="speckFine" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="1" seed="17" result="s"/>
        <feColorMatrix in="s" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.24  0 0 0 0 0.16  12 0 0 0 -7.7" result="d"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.005" numOctaves="2" seed="88" result="m"/>
        <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.5 0 0 0 -0.6" result="mask"/>
        <feComposite in="d" in2="mask" operator="in"/>
      </filter>
      <filter id="speckMid" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.3" numOctaves="1" seed="61" result="s"/>
        <feColorMatrix in="s" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.42  0 0 0 0 0.3  13 0 0 0 -8.8" result="d"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="2" seed="3" result="m"/>
        <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.5 0 0 0 -0.7" result="mask"/>
        <feComposite in="d" in2="mask" operator="in"/>
      </filter>
      <filter id="speckBig" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="23" result="s"/>
        <feColorMatrix in="s" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.24  17 0 0 0 -11.9" result="d"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="2" seed="7" result="m"/>
        <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -0.9" result="mask"/>
        <feComposite in="d" in2="mask" operator="in"/>
      </filter>
      <filter id="fibreA" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.03 0.45" numOctaves="2" seed="51" result="s"/>
        <feColorMatrix in="s" type="matrix" values="0 0 0 0 0.62  0 0 0 0 0.42  0 0 0 0 0.36  18 0 0 0 -13.6" result="d"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="29" result="m"/>
        <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  5 0 0 0 -2.3" result="mask"/>
        <feComposite in="d" in2="mask" operator="in"/>
      </filter>
      <filter id="fibreB" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.45 0.03" numOctaves="2" seed="64" result="s"/>
        <feColorMatrix in="s" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.5  0 0 0 0 0.6  18 0 0 0 -13.8" result="d"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="71" result="m"/>
        <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  5 0 0 0 -2.3" result="mask"/>
        <feComposite in="d" in2="mask" operator="in"/>
      </filter>
      <filter id="wash" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="4" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="30" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="7"/>
      </filter>
      <filter id="aq" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves="3" seed="3" result="n1"/>
        <feDisplacementMap in="SourceGraphic" in2="n1" scale="46" xChannelSelector="R" yChannelSelector="G" result="d1"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3" seed="13" result="n2"/>
        <feDisplacementMap in="d1" in2="n2" scale="12" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="1.6" result="soft"/>
        <feMorphology in="soft" operator="erode" radius="5" result="er"/>
        <feComposite in="soft" in2="er" operator="out" result="rim0"/>
        <feGaussianBlur in="rim0" stdDeviation="1.6" result="rim"/>
        <feColorMatrix in="rim" type="matrix" values="0.72 0 0 0 0  0 0.72 0 0 0  0 0 0.74 0 0  0 0 0 0.7 0" result="rimD"/>
        <feMerge result="painted"><feMergeNode in="soft"/><feMergeNode in="rimD"/></feMerge>
        <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="12" result="g"/>
        <feColorMatrix in="g" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -1.6 0 0 0 1.55" result="grain"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="40" result="h"/>
        <feColorMatrix in="h" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -16 0 0 0 11.9" result="holes"/>
        <feComposite in="painted" in2="grain" operator="in" result="pg"/>
        <feComposite in="pg" in2="holes" operator="in" result="ph"/>
        <feColorMatrix in="ph" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.8 0"/>
      </filter>
      <filter id="drop" x="-50%" y="-50%" width="200%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="2" seed="5" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="0.5"/>
      </filter>
      <filter id="aqS" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="5" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="0.5" result="soft"/>
        <feMorphology in="soft" operator="erode" radius="1.4" result="er"/>
        <feComposite in="soft" in2="er" operator="out" result="rim"/>
        <feColorMatrix in="rim" type="matrix" values="0.65 0 0 0 0  0 0.65 0 0 0  0 0 0.65 0 0  0 0 0 0.6 0" result="rimD"/>
        <feMerge><feMergeNode in="soft"/><feMergeNode in="rimD"/></feMerge>
      </filter>
      <filter id="aqT" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.13" numOctaves="3" seed="8" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="8" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="0.6" result="soft"/>
        <feMorphology in="soft" operator="erode" radius="1.2" result="er"/>
        <feComposite in="soft" in2="er" operator="out" result="rim"/>
        <feColorMatrix in="rim" type="matrix" values="0.6 0 0 0 0  0 0.62 0 0 0  0 0 0.6 0 0  0 0 0 0.55 0" result="rimD"/>
        <feMerge><feMergeNode in="soft"/><feMergeNode in="rimD"/></feMerge>
      </filter>
      <filter id="desat" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0.3"/></filter>
      <symbol id="tc" viewBox="-16 -16 32 32" overflow="visible">
        <circle cx="3" cy="4" r="9" fill="#3F5A30" opacity="0.22"/>
        <circle cx="-5" cy="-2" r="7" fill="#7E9B58"/><circle cx="4" cy="-5" r="6.5" fill="#6A8A47"/>
        <circle cx="2" cy="4" r="7.5" fill="#8DA866"/><circle cx="-4" cy="5" r="5" fill="#5D7C3E"/><circle cx="7" cy="2" r="4.5" fill="#A4B877"/>
      </symbol>
      <symbol id="tv" viewBox="-16 -16 32 32" overflow="visible">
        <circle cx="3" cy="5" r="9" fill="#2E3B22" opacity="0.28"/>
        <circle cx="-5" cy="-2" r="7" fill="#7E9558"/><circle cx="4" cy="-5" r="6.5" fill="#62784A"/>
        <circle cx="2" cy="4" r="7.5" fill="#94A86C"/><circle cx="-4" cy="5" r="5" fill="#526641"/><circle cx="7" cy="2" r="4.5" fill="#AFBD84"/>
      </symbol>
      <symbol id="fb" viewBox="-14 -8 28 16" overflow="visible">
        <ellipse cx="0" cy="0" rx="14" ry="7" fill="#93A672"/>
        <circle cx="-8" cy="-1" r="2.6" fill="#CF8A94"/><circle cx="-3" cy="2" r="2.4" fill="#DDBB78"/><circle cx="2" cy="-2" r="2.6" fill="#A497BE"/>
        <circle cx="7" cy="1" r="2.4" fill="#CF8A94"/><circle cx="10" cy="-2" r="2" fill="#DDBB78"/>
      </symbol>
      <symbol id="hr" viewBox="0 0 26 16" overflow="visible">
        <rect x="2" y="2" width="26" height="16" fill="#00000012"/><rect width="26" height="16" fill="#D3A487"/><path d="M0 8H26" stroke="#B07D62" stroke-width="1.2"/>
      </symbol>
      <symbol id="hg" viewBox="0 0 30 18" overflow="visible">
        <rect x="2" y="2" width="30" height="18" fill="#00000010"/><rect width="30" height="18" fill="#CFCAC2"/><path d="M0 9H30" stroke="#A9A39A" stroke-width="1.2"/>
      </symbol>
      <filter id="smear" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="77" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="60" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="22"/>
      </filter>
      <filter id="smearS" x="-40%" y="-80%" width="180%" height="260%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="35" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="7"/>
      </filter>
<filter id="smearT" x="-20%" y="-60%" width="140%" height="220%">
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="58" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="10"/>
      </filter>`,
night: `<filter id="tone" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="3" seed="9"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.6  0 0 0 0 0.5  0 0 0 0 0.35  0.5 0 0 0 -0.2"/>
      </filter>
      <filter id="speckFine" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="1" seed="17"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.24  0 0 0 0 0.16  12 0 0 0 -7.7"/>
      </filter>
      <filter id="speckBig" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="23"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.24  16 0 0 0 -11.4"/>
      </filter>
      <filter id="fibreA" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.03 0.45" numOctaves="2" seed="51"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.62  0 0 0 0 0.42  0 0 0 0 0.36  18 0 0 0 -13"/>
      </filter>
      <filter id="fibreB" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.45 0.03" numOctaves="2" seed="64"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.5  0 0 0 0 0.6  18 0 0 0 -13.2"/>
      </filter>
      <filter id="wash" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="4" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="30" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="7"/>
      </filter>
      <filter id="aq" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves="3" seed="3" result="n1"/>
        <feDisplacementMap in="SourceGraphic" in2="n1" scale="46" xChannelSelector="R" yChannelSelector="G" result="d1"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3" seed="13" result="n2"/>
        <feDisplacementMap in="d1" in2="n2" scale="12" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="1.6" result="soft"/>
        <feMorphology in="soft" operator="erode" radius="5" result="er"/>
        <feComposite in="soft" in2="er" operator="out" result="rim0"/>
        <feGaussianBlur in="rim0" stdDeviation="1.6" result="rim"/>
        <feColorMatrix in="rim" type="matrix" values="0.72 0 0 0 0  0 0.72 0 0 0  0 0 0.74 0 0  0 0 0 0.7 0" result="rimD"/>
        <feMerge result="painted"><feMergeNode in="soft"/><feMergeNode in="rimD"/></feMerge>
        <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="12" result="g"/>
        <feColorMatrix in="g" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -1.6 0 0 0 1.55" result="grain"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="40" result="h"/>
        <feColorMatrix in="h" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -16 0 0 0 11.9" result="holes"/>
        <feComposite in="painted" in2="grain" operator="in" result="pg"/>
        <feComposite in="pg" in2="holes" operator="in" result="ph"/>
        <feColorMatrix in="ph" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.8 0"/>
      </filter>
      <filter id="drop" x="-50%" y="-50%" width="200%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="2" seed="5" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="0.5"/>
      </filter>
      <filter id="aqS" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="5" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="0.5" result="soft"/>
        <feMorphology in="soft" operator="erode" radius="1.4" result="er"/>
        <feComposite in="soft" in2="er" operator="out" result="rim"/>
        <feColorMatrix in="rim" type="matrix" values="0.65 0 0 0 0  0 0.65 0 0 0  0 0 0.65 0 0  0 0 0 0.6 0" result="rimD"/>
        <feMerge><feMergeNode in="soft"/><feMergeNode in="rimD"/></feMerge>
      </filter>
      <filter id="aqT" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.13" numOctaves="3" seed="8" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="8" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="0.6" result="soft"/>
        <feMorphology in="soft" operator="erode" radius="1.2" result="er"/>
        <feComposite in="soft" in2="er" operator="out" result="rim"/>
        <feColorMatrix in="rim" type="matrix" values="0.6 0 0 0 0  0 0.62 0 0 0  0 0 0.6 0 0  0 0 0 0.55 0" result="rimD"/>
        <feMerge><feMergeNode in="soft"/><feMergeNode in="rimD"/></feMerge>
      </filter>
      <filter id="desat" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0.3"/></filter>
      <symbol id="tc" viewBox="-16 -16 32 32" overflow="visible">
        <circle cx="3" cy="4" r="9" fill="#3F5A30" opacity="0.22"/>
        <circle cx="-5" cy="-2" r="7" fill="#7E9B58"/><circle cx="4" cy="-5" r="6.5" fill="#6A8A47"/>
        <circle cx="2" cy="4" r="7.5" fill="#8DA866"/><circle cx="-4" cy="5" r="5" fill="#5D7C3E"/><circle cx="7" cy="2" r="4.5" fill="#A4B877"/>
      </symbol>
      <symbol id="tv" viewBox="-16 -16 32 32" overflow="visible">
        <circle cx="3" cy="5" r="9" fill="#2E3B22" opacity="0.28"/>
        <circle cx="-5" cy="-2" r="7" fill="#7E9558"/><circle cx="4" cy="-5" r="6.5" fill="#62784A"/>
        <circle cx="2" cy="4" r="7.5" fill="#94A86C"/><circle cx="-4" cy="5" r="5" fill="#526641"/><circle cx="7" cy="2" r="4.5" fill="#AFBD84"/>
      </symbol>
      <symbol id="fb" viewBox="-14 -8 28 16" overflow="visible">
        <ellipse cx="0" cy="0" rx="14" ry="7" fill="#93A672"/>
        <circle cx="-8" cy="-1" r="2.6" fill="#CF8A94"/><circle cx="-3" cy="2" r="2.4" fill="#DDBB78"/><circle cx="2" cy="-2" r="2.6" fill="#A497BE"/>
        <circle cx="7" cy="1" r="2.4" fill="#CF8A94"/><circle cx="10" cy="-2" r="2" fill="#DDBB78"/>
      </symbol>
      <symbol id="hr" viewBox="0 0 26 16" overflow="visible">
        <rect x="2" y="2" width="26" height="16" fill="#00000012"/><rect width="26" height="16" fill="#D3A487"/><path d="M0 8H26" stroke="#B07D62" stroke-width="1.2"/>
      </symbol>
      <symbol id="hg" viewBox="0 0 30 18" overflow="visible">
        <rect x="2" y="2" width="30" height="18" fill="#00000010"/><rect width="30" height="18" fill="#CFCAC2"/><path d="M0 9H30" stroke="#A9A39A" stroke-width="1.2"/>
      </symbol>
      <filter id="nightBg" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.36 0 0 0 0.03  0 0.4 0 0 0.05  0 0 0.5 0 0.09  0 0 0 1 0"/></filter>
      <filter id="nightFg" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.6 0 0 0 0.02  0 0.64 0 0 0.04  0 0 0.72 0 0.08  0 0 0 1 0"/></filter>
      <filter id="skyTone" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.003" numOctaves="3" seed="19"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.32  0 0 0 0 0.5  0.6 0 0 0 -0.22"/>
      </filter>
      <filter id="starsFine" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="1" seed="17" result="s"/>
        <feColorMatrix in="s" type="matrix" values="0 0 0 0 0.98  0 0 0 0 0.88  0 0 0 0 0.6  16 0 0 0 -11.0" result="d"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.0035" numOctaves="2" seed="91" result="m"/>
        <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  6 0 0 0 -2.4" result="mask"/>
        <feComposite in="d" in2="mask" operator="in"/>
      </filter>
      <filter id="starsBig" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.13" numOctaves="2" seed="23" result="s"/>
        <feColorMatrix in="s" type="matrix" values="0 0 0 0 1  0 0 0 0 0.86  0 0 0 0 0.5  23 0 0 0 -17.0" result="c0"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="5" result="m"/>
        <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  4 0 0 0 -1.6" result="mask"/>
        <feComposite in="c0" in2="mask" operator="in" result="c"/>
        <feGaussianBlur in="c" stdDeviation="1.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="c"/></feMerge>
      </filter>
      <filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="5"/></filter>
      <radialGradient id="fireG"><stop offset="0" stop-color="#FFC56B" stop-opacity="0.75"/><stop offset="0.45" stop-color="#F08A3C" stop-opacity="0.28"/><stop offset="1" stop-color="#F08A3C" stop-opacity="0"/></radialGradient>
      <radialGradient id="lampG"><stop offset="0" stop-color="#FFE3A0" stop-opacity="0.8"/><stop offset="1" stop-color="#FFD27A" stop-opacity="0"/></radialGradient>
      <filter id="smear" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="77" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="60" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="22"/>
      </filter>
      <filter id="smearS" x="-40%" y="-80%" width="180%" height="260%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="35" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="7"/>
      </filter>
<filter id="smearT" x="-20%" y="-60%" width="140%" height="220%">
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="58" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="10"/>
      </filter>`,
} as const
