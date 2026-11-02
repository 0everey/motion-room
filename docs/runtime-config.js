let configuration;
export function applicationBuild(){if(configuration!==undefined)return configuration;const element=globalThis.document?.getElementById('applicationBuild');configuration=element?JSON.parse(element.textContent):null;return configuration;}
