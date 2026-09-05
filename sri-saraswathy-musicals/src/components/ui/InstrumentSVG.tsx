"use client";

interface Props {
  instrument: string;
  className?: string;
}

/**
 * Lightweight SVG instrument illustrations — one shared component,
 * chosen by key. All use currentColor + gold accents so they inherit.
 * Deliberately compact so they stay smooth on mobile.
 */
export function InstrumentSVG({ instrument, className }: Props) {
  const common = "w-full h-full";
  const wrap = className ? `${common} ${className}` : common;

  switch (instrument) {
    case "violin":
      return (
        <svg viewBox="-60 -20 120 300" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="v-body" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8C5220" />
              <stop offset="45%" stopColor="#C9A24B" />
              <stop offset="100%" stopColor="#4A2E14" />
            </linearGradient>
          </defs>
          <path d="M-4,-12 q-6,-6 -1,-11 q5,-5 10,0 q5,6 -1,11 z" fill="#3A2412" stroke="#C9A24B" strokeWidth=".6" />
          <circle cx="-4" cy="0" r="1.4" fill="#C9A24B" />
          <circle cx="4" cy="2" r="1.4" fill="#C9A24B" />
          <circle cx="-4" cy="9" r="1.4" fill="#C9A24B" />
          <circle cx="4" cy="11" r="1.4" fill="#C9A24B" />
          <rect x="-3" y="6" width="6" height="90" fill="#1F1108" />
          <line x1="-2" y1="8" x2="-2" y2="180" stroke="#F5EACA" strokeWidth=".3" opacity=".7" />
          <line x1="-0.7" y1="8" x2="-0.7" y2="180" stroke="#F5EACA" strokeWidth=".3" opacity=".7" />
          <line x1="0.7" y1="8" x2="0.7" y2="180" stroke="#F5EACA" strokeWidth=".3" opacity=".7" />
          <line x1="2" y1="8" x2="2" y2="180" stroke="#F5EACA" strokeWidth=".3" opacity=".7" />
          <path d="M-30,100 C -36,112 -40,132 -36,150 C -32,158 -22,162 -14,164 C -19,172 -22,184 -22,198 C -22,220 -30,240 -34,258 C -37,278 -25,300 0,304 C 25,300 37,278 34,258 C 30,240 22,220 22,198 C 22,184 19,172 14,164 C 22,162 32,158 36,150 C 40,132 36,112 30,100 C 22,94 14,92 6,94 C 3,98 -3,98 -6,94 C -14,92 -22,94 -30,100 Z"
                fill="url(#v-body)" stroke="#2A1608" strokeWidth=".6" />
          <path d="M-12,198 c-2,3 -3,14 -1,22 c1,2 -1,3 -3,1 c-3,-4 -3,-16 0,-24 c1,-1 4,-1 4,1 z" fill="#0A0503" />
          <path d="M12,198 c2,3 3,14 1,22 c-1,2 1,3 3,1 c3,-4 3,-16 0,-24 c-1,-1 -4,-1 -4,1 z" fill="#0A0503" />
          <path d="M-6,208 L-6,204 L-2,205 L-2,202 L2,202 L2,205 L6,204 L6,208 Z" fill="#3A2412" stroke="#C9A24B" strokeWidth=".3" />
          <path d="M-6,266 L6,266 L4,286 L-4,286 Z" fill="#1F1108" stroke="#C9A24B" strokeWidth=".3" />
        </svg>
      );

    case "guitar":
      return (
        <svg viewBox="-70 -20 140 320" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g-body" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#A97530" />
              <stop offset="50%" stopColor="#DFBE58" />
              <stop offset="100%" stopColor="#5A3818" />
            </linearGradient>
          </defs>
          <path d="M-6,-8 L6,-8 L8,4 L-8,4 Z" fill="#1F1108" stroke="#C9A24B" strokeWidth=".4" />
          <circle cx="-5" cy="-2" r="1.2" fill="#C9A24B" />
          <circle cx="0" cy="-2" r="1.2" fill="#C9A24B" />
          <circle cx="5" cy="-2" r="1.2" fill="#C9A24B" />
          <rect x="-5" y="4" width="10" height="140" fill="#2A1608" stroke="#C9A24B" strokeWidth=".2" />
          <g stroke="#C9A24B" strokeWidth=".2" opacity=".6">
            <line x1="-5" y1="24" x2="5" y2="24" />
            <line x1="-5" y1="44" x2="5" y2="44" />
            <line x1="-5" y1="64" x2="5" y2="64" />
            <line x1="-5" y1="84" x2="5" y2="84" />
            <line x1="-5" y1="104" x2="5" y2="104" />
            <line x1="-5" y1="124" x2="5" y2="124" />
          </g>
          <g stroke="#F5EACA" strokeWidth=".22" opacity=".75">
            <line x1="-3" y1="4" x2="-3" y2="250" />
            <line x1="-1.8" y1="4" x2="-1.8" y2="250" />
            <line x1="-0.6" y1="4" x2="-0.6" y2="250" />
            <line x1="0.6" y1="4" x2="0.6" y2="250" />
            <line x1="1.8" y1="4" x2="1.8" y2="250" />
            <line x1="3" y1="4" x2="3" y2="250" />
          </g>
          <path d="M-45,155
                   C -60,168 -66,208 -60,250
                   C -54,290 -30,308 0,310
                   C 30,308 54,290 60,250
                   C 66,208 60,168 45,155
                   C 36,150 22,148 12,151
                   C 6,155 -6,155 -12,151
                   C -22,148 -36,150 -45,155 Z"
                fill="url(#g-body)" stroke="#3A1D0A" strokeWidth=".6" />
          <circle cx="0" cy="220" r="16" fill="#0A0503" />
          <circle cx="0" cy="220" r="16" fill="none" stroke="#C9A24B" strokeWidth=".6" />
          <circle cx="0" cy="220" r="14" fill="none" stroke="#C9A24B" strokeWidth=".2" opacity=".6" />
          <rect x="-12" y="256" width="24" height="6" rx=".5" fill="#1F1108" stroke="#C9A24B" strokeWidth=".3" />
        </svg>
      );

    case "piano":
      return (
        <svg viewBox="-120 -20 240 260" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <path d="M-110,0 L110,0 L100,22 L-100,22 Z" fill="#1F1108" stroke="#C9A24B" strokeWidth=".5" />
          <text x="0" y="15" textAnchor="middle" fontFamily="serif" fontSize="7" fontStyle="italic" fill="#C9A24B">Sri Saraswathy</text>
          <g fill="#FAF6EC" stroke="#8A7A65" strokeWidth=".3">
            <rect x="-100" y="22" width="17" height="200" />
            <rect x="-83" y="22" width="17" height="200" />
            <rect x="-66" y="22" width="17" height="200" />
            <rect x="-49" y="22" width="17" height="200" />
            <rect x="-32" y="22" width="17" height="200" />
            <rect x="-15" y="22" width="17" height="200" />
            <rect x="2" y="22" width="17" height="200" />
            <rect x="19" y="22" width="17" height="200" />
            <rect x="36" y="22" width="17" height="200" />
            <rect x="53" y="22" width="17" height="200" />
            <rect x="70" y="22" width="17" height="200" />
            <rect x="87" y="22" width="17" height="200" />
          </g>
          <g fill="#0A0908">
            <rect x="-90" y="22" width="12" height="130" />
            <rect x="-72" y="22" width="12" height="130" />
            <rect x="-38" y="22" width="12" height="130" />
            <rect x="-21" y="22" width="12" height="130" />
            <rect x="-4" y="22" width="12" height="130" />
            <rect x="30" y="22" width="12" height="130" />
            <rect x="47" y="22" width="12" height="130" />
            <rect x="81" y="22" width="12" height="130" />
            <rect x="98" y="22" width="12" height="130" />
          </g>
          <rect x="-100" y="22" width="200" height="14" fill="rgba(201,162,75,0.14)" />
        </svg>
      );

    case "veena":
      return (
        <svg viewBox="-70 -10 140 300" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="veena-gourd" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#DFBE58" />
              <stop offset="60%" stopColor="#A97530" />
              <stop offset="100%" stopColor="#4A2E14" />
            </radialGradient>
          </defs>
          <ellipse cx="0" cy="240" rx="55" ry="45" fill="url(#veena-gourd)" stroke="#3A1D0A" strokeWidth=".6" />
          <ellipse cx="-20" cy="230" rx="12" ry="8" fill="none" stroke="#DFBE58" strokeWidth=".4" opacity=".6" />
          <ellipse cx="20" cy="230" rx="12" ry="8" fill="none" stroke="#DFBE58" strokeWidth=".4" opacity=".6" />
          <circle cx="0" cy="245" r="3" fill="#4A2E14" />
          <rect x="-4" y="40" width="8" height="200" fill="#5A3818" stroke="#C9A24B" strokeWidth=".3" />
          <g stroke="#C9A24B" strokeWidth=".4" opacity=".8">
            {Array.from({ length: 22 }, (_, i) => (
              <line key={i} x1="-4" y1={50 + i * 8} x2="4" y2={50 + i * 8} />
            ))}
          </g>
          <g stroke="#F5EACA" strokeWidth=".2" opacity=".7">
            <line x1="-1.5" y1="40" x2="-1.5" y2="250" />
            <line x1="-0.5" y1="40" x2="-0.5" y2="250" />
            <line x1="0.5" y1="40" x2="0.5" y2="250" />
            <line x1="1.5" y1="40" x2="1.5" y2="250" />
          </g>
          <ellipse cx="0" cy="30" rx="12" ry="16" fill="#3A1D0A" stroke="#C9A24B" strokeWidth=".6" />
          <path d="M-8,20 C -12,10 -10,0 -4,-4 C 0,-6 4,-4 8,0 C 12,8 10,18 8,22 Z" fill="#C9A24B" stroke="#3A1D0A" strokeWidth=".4" />
          <circle cx="-4" cy="25" r=".8" fill="#5A3818" />
          <circle cx="4" cy="25" r=".8" fill="#5A3818" />
          <circle cx="-4" cy="35" r=".8" fill="#5A3818" />
          <circle cx="4" cy="35" r=".8" fill="#5A3818" />
          <ellipse cx="0" cy="285" rx="22" ry="8" fill="#4A2E14" stroke="#C9A24B" strokeWidth=".4" opacity=".6" />
        </svg>
      );

    case "sitar":
      return (
        <svg viewBox="-60 -20 120 320" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="sitar-gourd" cx="50%" cy="60%">
              <stop offset="0%" stopColor="#DFBE58" />
              <stop offset="70%" stopColor="#8C5220" />
              <stop offset="100%" stopColor="#2A1608" />
            </radialGradient>
          </defs>
          <ellipse cx="0" cy="245" rx="50" ry="52" fill="url(#sitar-gourd)" stroke="#2A1608" strokeWidth=".6" />
          <ellipse cx="0" cy="270" rx="20" ry="6" fill="#3A1D0A" opacity=".4" />
          <ellipse cx="-25" cy="225" rx="6" ry="4" fill="#DFBE58" opacity=".4" />
          <rect x="-6" y="-10" width="12" height="250" fill="#5A3818" stroke="#C9A24B" strokeWidth=".3" />
          <path d="M-8,-10 L8,-10 L6,4 L-6,4 Z" fill="#3A1D0A" />
          <g fill="#C9A24B">
            <circle cx="-8" cy="-4" r="1.2" />
            <circle cx="-8" cy="6" r="1.2" />
            <circle cx="8" cy="-4" r="1.2" />
            <circle cx="8" cy="6" r="1.2" />
          </g>
          <g stroke="#C9A24B" strokeWidth=".3" opacity=".7">
            {Array.from({ length: 20 }, (_, i) => (
              <line key={i} x1="-6" y1={30 + i * 10} x2="6" y2={30 + i * 10} />
            ))}
          </g>
          <g stroke="#F5EACA" strokeWidth=".2" opacity=".7">
            <line x1="-4" y1="4" x2="-4" y2="240" />
            <line x1="-2" y1="4" x2="-2" y2="240" />
            <line x1="0" y1="4" x2="0" y2="240" />
            <line x1="2" y1="4" x2="2" y2="240" />
            <line x1="4" y1="4" x2="4" y2="240" />
          </g>
          <rect x="-3" y="245" width="6" height="8" fill="#4A2E14" />
        </svg>
      );

    case "tabla":
      return (
        <svg viewBox="-90 -20 180 220" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="dayan-wood" cx="50%" cy="30%">
              <stop offset="0%" stopColor="#DFBE58" />
              <stop offset="50%" stopColor="#A97530" />
              <stop offset="100%" stopColor="#3A1D0A" />
            </radialGradient>
            <radialGradient id="bayan-brass" cx="50%" cy="30%">
              <stop offset="0%" stopColor="#F5EACA" />
              <stop offset="50%" stopColor="#C9A24B" />
              <stop offset="100%" stopColor="#5A3818" />
            </radialGradient>
          </defs>
          <ellipse cx="45" cy="180" rx="35" ry="8" fill="#4A2E14" opacity=".4" />
          <ellipse cx="-45" cy="180" rx="42" ry="9" fill="#4A2E14" opacity=".4" />
          <path d="M15,60 L75,60 L70,170 C 70,180 55,184 45,184 C 35,184 20,180 20,170 Z"
                fill="url(#dayan-wood)" stroke="#3A1D0A" strokeWidth=".6" />
          <ellipse cx="45" cy="60" rx="30" ry="10" fill="#EBE5D6" stroke="#8A7A65" strokeWidth=".4" />
          <ellipse cx="45" cy="60" rx="30" ry="10" fill="none" stroke="#5A3818" strokeWidth=".3" strokeDasharray="1 1" />
          <ellipse cx="45" cy="60" rx="14" ry="5" fill="#0A0503" />
          <g stroke="#5A3818" strokeWidth=".4" opacity=".7">
            {Array.from({ length: 10 }, (_, i) => {
              const angle = (i * Math.PI * 2) / 10;
              const x1 = 45 + Math.cos(angle) * 30;
              const x2 = 45 + Math.cos(angle) * 30;
              return (
                <line key={i} x1={x1} y1="65" x2={x2} y2="170" />
              );
            })}
          </g>
          <path d="M-80,80 L-10,80 L-15,168 C -15,178 -30,182 -45,182 C -60,182 -75,178 -80,168 Z"
                fill="url(#bayan-brass)" stroke="#5A3818" strokeWidth=".6" />
          <ellipse cx="-45" cy="80" rx="35" ry="12" fill="#EBE5D6" stroke="#8A7A65" strokeWidth=".4" />
          <ellipse cx="-45" cy="80" rx="35" ry="12" fill="none" stroke="#5A3818" strokeWidth=".3" strokeDasharray="1 1" />
          <ellipse cx="-45" cy="80" rx="10" ry="4" fill="#0A0503" />
          <g stroke="#5A3818" strokeWidth=".4" opacity=".7">
            {Array.from({ length: 10 }, (_, i) => {
              const angle = (i * Math.PI * 2) / 10;
              const x1 = -45 + Math.cos(angle) * 35;
              const x2 = -45 + Math.cos(angle) * 35;
              return (
                <line key={i} x1={x1} y1="90" x2={x2} y2="170" />
              );
            })}
          </g>
        </svg>
      );

    case "mridangam":
      return (
        <svg viewBox="-120 -20 240 200" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="mrid-wood" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3A1D0A" />
              <stop offset="15%" stopColor="#A97530" />
              <stop offset="50%" stopColor="#DFBE58" />
              <stop offset="85%" stopColor="#A97530" />
              <stop offset="100%" stopColor="#3A1D0A" />
            </linearGradient>
          </defs>
          <ellipse cx="0" cy="165" rx="100" ry="10" fill="#4A2E14" opacity=".4" />
          <path d="M-100,70 C -105,110 -100,140 -85,155 L 85,155 C 100,140 105,110 100,70 C 95,50 80,45 65,50 L -65,50 C -80,45 -95,50 -100,70 Z"
                fill="url(#mrid-wood)" stroke="#3A1D0A" strokeWidth=".6" />
          <ellipse cx="-85" cy="82" rx="18" ry="30" fill="#EBE5D6" stroke="#8A7A65" strokeWidth=".4" />
          <ellipse cx="-85" cy="82" rx="18" ry="30" fill="none" stroke="#5A3818" strokeWidth=".3" strokeDasharray="1 1" />
          <ellipse cx="-85" cy="82" rx="7" ry="12" fill="#0A0503" />
          <ellipse cx="85" cy="82" rx="18" ry="30" fill="#EBE5D6" stroke="#8A7A65" strokeWidth=".4" />
          <ellipse cx="85" cy="82" rx="18" ry="30" fill="none" stroke="#5A3818" strokeWidth=".3" strokeDasharray="1 1" />
          <g stroke="#5A3818" strokeWidth=".5" opacity=".7">
            <line x1="-70" y1="82" x2="70" y2="82" strokeDasharray="2 3" />
            <line x1="-70" y1="98" x2="70" y2="98" strokeDasharray="2 3" />
            <line x1="-70" y1="114" x2="70" y2="114" strokeDasharray="2 3" />
          </g>
        </svg>
      );

    case "sax":
      return (
        <svg viewBox="-80 -20 160 320" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="sax-brass" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#5A3818" />
              <stop offset="35%" stopColor="#DFBE58" />
              <stop offset="65%" stopColor="#C9A24B" />
              <stop offset="100%" stopColor="#5A3818" />
            </linearGradient>
          </defs>
          <path d="M-4,-15 L4,-15 L3,4 L-3,4 Z" fill="#1F1108" stroke="#C9A24B" strokeWidth=".4" />
          <path d="M0,4 C -2,14 -4,22 -2,32 C 0,38 4,40 6,40" fill="none" stroke="url(#sax-brass)" strokeWidth="10" strokeLinecap="round" />
          <path d="M6,40 C 12,40 14,48 14,58 L 14,220 C 14,244 8,262 -6,278 C -22,296 -46,296 -58,278 C -66,266 -64,240 -52,232 C -38,224 -22,232 -14,246"
                fill="none" stroke="url(#sax-brass)" strokeWidth="16" strokeLinecap="round" />
          <path d="M-52,232 C -70,224 -70,262 -58,278 C -46,296 -22,296 -6,278 C -10,286 -34,288 -52,278 C -63,270 -66,248 -52,232 Z"
                fill="url(#sax-brass)" stroke="#3A1D0A" strokeWidth=".6" />
          <g fill="#DFBE58" stroke="#3A1D0A" strokeWidth=".3">
            <circle cx="20" cy="60" r="4" />
            <circle cx="20" cy="80" r="3.5" />
            <circle cx="20" cy="100" r="3.5" />
            <circle cx="20" cy="120" r="3.5" />
            <circle cx="20" cy="140" r="4" />
            <circle cx="20" cy="160" r="3.5" />
            <circle cx="20" cy="180" r="3.5" />
            <circle cx="20" cy="200" r="4" />
          </g>
        </svg>
      );

    case "flute":
      return (
        <svg viewBox="-80 -10 160 60" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="flute-bamboo" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#5A3818" />
              <stop offset="50%" stopColor="#DFBE58" />
              <stop offset="100%" stopColor="#5A3818" />
            </linearGradient>
          </defs>
          <rect x="-75" y="20" width="150" height="10" rx="4" fill="url(#flute-bamboo)" stroke="#3A1D0A" strokeWidth=".4" />
          <g fill="#1F1108">
            <circle cx="-55" cy="25" r="2" />
            <circle cx="-38" cy="25" r="2" />
            <circle cx="-21" cy="25" r="2" />
            <circle cx="-4" cy="25" r="2" />
            <circle cx="13" cy="25" r="2" />
            <circle cx="30" cy="25" r="2" />
          </g>
          <circle cx="-65" cy="25" r="2.5" fill="#0A0503" />
          <line x1="-30" y1="20" x2="-30" y2="30" stroke="#3A1D0A" strokeWidth=".3" opacity=".5" />
          <line x1="10" y1="20" x2="10" y2="30" stroke="#3A1D0A" strokeWidth=".3" opacity=".5" />
        </svg>
      );

    case "tanpura":
      return (
        <svg viewBox="-45 -20 90 320" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="tanp-gourd" cx="50%" cy="60%">
              <stop offset="0%" stopColor="#DFBE58" />
              <stop offset="70%" stopColor="#8C5220" />
              <stop offset="100%" stopColor="#2A1608" />
            </radialGradient>
          </defs>
          <ellipse cx="0" cy="255" rx="38" ry="42" fill="url(#tanp-gourd)" stroke="#2A1608" strokeWidth=".6" />
          <ellipse cx="0" cy="275" rx="15" ry="4" fill="#3A1D0A" opacity=".5" />
          <rect x="-4" y="-10" width="8" height="230" fill="#5A3818" stroke="#C9A24B" strokeWidth=".3" />
          <path d="M-6,-10 L6,-10 L4,6 L-4,6 Z" fill="#3A1D0A" />
          <g fill="#C9A24B">
            <circle cx="-6" cy="-4" r="1.2" />
            <circle cx="-6" cy="6" r="1.2" />
            <circle cx="6" cy="-4" r="1.2" />
            <circle cx="6" cy="6" r="1.2" />
          </g>
          <g stroke="#F5EACA" strokeWidth=".25" opacity=".8">
            <line x1="-2" y1="6" x2="-2" y2="230" />
            <line x1="-0.6" y1="6" x2="-0.6" y2="230" />
            <line x1="0.6" y1="6" x2="0.6" y2="230" />
            <line x1="2" y1="6" x2="2" y2="230" />
          </g>
        </svg>
      );

    case "harmonium":
      return (
        <svg viewBox="-90 -20 180 180" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <path d="M-85,40 L85,40 L85,140 L-85,140 Z" fill="#5A3818" stroke="#3A1D0A" strokeWidth=".6" />
          <path d="M-85,40 L-70,20 L70,20 L85,40 Z" fill="#3A1D0A" stroke="#C9A24B" strokeWidth=".4" />
          <rect x="-70" y="60" width="140" height="4" fill="#C9A24B" />
          <g fill="#FAF6EC" stroke="#8A7A65" strokeWidth=".3">
            {Array.from({ length: 14 }, (_, i) => (
              <rect key={i} x={-70 + i * 10} y="64" width="10" height="55" />
            ))}
          </g>
          <g fill="#0A0908">
            {[0, 1, 3, 4, 5, 7, 8, 10, 11, 12].map((i) => (
              <rect key={i} x={-63 + i * 10} y="64" width="6" height="34" />
            ))}
          </g>
          <circle cx="-30" cy="130" r="4" fill="#C9A24B" />
          <circle cx="30" cy="130" r="4" fill="#C9A24B" />
          <text x="0" y="34" textAnchor="middle" fontFamily="serif" fontSize="6" fontStyle="italic" fill="#DFBE58">Bina</text>
        </svg>
      );

    case "drums":
      return (
        <svg viewBox="-100 -20 200 200" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="0" cy="160" rx="80" ry="10" fill="#4A2E14" opacity=".3" />
          <circle cx="0" cy="110" r="35" fill="#0A0908" stroke="#C9A24B" strokeWidth="1" />
          <circle cx="0" cy="110" r="35" fill="#1F1108" opacity=".8" />
          <circle cx="0" cy="110" r="32" fill="none" stroke="#C9A24B" strokeWidth=".3" strokeDasharray="2 2" />
          <ellipse cx="-70" cy="75" rx="25" ry="4" fill="#C9A24B" stroke="#5A3818" strokeWidth=".4" />
          <ellipse cx="-70" cy="72" rx="25" ry="4" fill="#DFBE58" stroke="#5A3818" strokeWidth=".4" />
          <ellipse cx="70" cy="75" rx="25" ry="4" fill="#DFBE58" stroke="#5A3818" strokeWidth=".4" />
          <rect x="-45" y="60" width="20" height="30" fill="#1F1108" stroke="#C9A24B" strokeWidth=".4" />
          <ellipse cx="-35" cy="60" rx="10" ry="3" fill="#FAF6EC" />
          <rect x="25" y="60" width="20" height="30" fill="#1F1108" stroke="#C9A24B" strokeWidth=".4" />
          <ellipse cx="35" cy="60" rx="10" ry="3" fill="#FAF6EC" />
        </svg>
      );

    case "accessory":
      return (
        <svg viewBox="-60 -20 120 200" className={wrap} xmlns="http://www.w3.org/2000/svg">
          <path d="M-40,60 c 5,-20 30,-30 30,-10 c 0,15 30,10 40,25 c 8,15 -5,35 -25,40 c -25,5 -50,-15 -45,-55 z"
                fill="none" stroke="#C9A24B" strokeWidth="2" opacity=".8" />
          <path d="M-25,110 c 5,-15 20,-20 25,-5 c 5,15 20,5 25,20 c 5,15 -5,30 -20,32 c -18,2 -35,-15 -30,-47 z"
                fill="none" stroke="#DFBE58" strokeWidth="1.4" opacity=".7" />
          <circle cx="0" cy="90" r="4" fill="#5A3818" />
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 100 100" className={wrap}>
          <rect width="100" height="100" fill="#C9A24B" opacity=".2" />
        </svg>
      );
  }
}
