// Pure data: safe for the progressive entry before Three.js is requested.
export const DEFAULT_ENVIRONMENT='mixamo';
export const PREVIEW_ENVIRONMENTS={
  mixamo:{key:'mixamo',label:'Mixamo 灰棚',background:'#9e9e9e',ground:'#b7b7b7',grid:'#858585',sky:'#ffffff',bounce:'#aaa8a5',keyColor:'#ffffff',keyIntensity:2.2,fillColor:'#dce4ee',fillIntensity:.32,hemisphere:.85,sun:[-3,6,5],fogNear:10,fogFar:48,reflection:.22,light:true,platform:false},
  dark:{key:'dark',label:'深色网格',background:'#152330',ground:'#1d303e',grid:'#607984',gridOpacity:.38,sky:'#d6ebff',bounce:'#4e5b66',keyColor:'#e2edff',keyIntensity:2.1,fillColor:'#b8d5ff',fillIntensity:.45,hemisphere:1,sun:[-3,6,5],fogNear:10,fogFar:48,reflection:.3,light:false,platform:false},
  studio:{key:'studio',label:'暖光展台',background:'#25212b',ground:'#403c44',grid:'#8b7f8a',gridOpacity:.14,sky:'#f3e8e0',bounce:'#39303f',keyColor:'#ffe0b4',keyIntensity:2.4,fillColor:'#b4ccff',fillIntensity:.55,hemisphere:.8,sun:[-4,7,5],fogNear:10,fogFar:48,reflection:.3,light:false,platform:true},
  daylight:{key:'daylight',label:'日光地面',background:'#c7deed',ground:'#d4cdb9',grid:'#969d95',gridOpacity:.3,gridScale:2,sky:'#d4eaff',bounce:'#8a8070',keyColor:'#fff1d6',keyIntensity:2.7,fillColor:'#bbdbf5',fillIntensity:.5,hemisphere:.9,sun:[-6,9,3],fogNear:16,fogFar:70,reflection:.26,light:true,platform:false},
};
export const isEnvironment=key=>Object.hasOwn(PREVIEW_ENVIRONMENTS,key);
export const environmentProfile=key=>PREVIEW_ENVIRONMENTS[isEnvironment(key)?key:DEFAULT_ENVIRONMENT];
