// Theme registry shared by the app, admin and the inline <head> boot script.
export const THEMES=[
 {id:'navy_coral',name:'Navy + San hô',note:'Mặc định · mạnh mẽ, trẻ trung',logo:'assets/logos/logo-navy-coral.png',bg:'#0c1a2b',accent:'#ff6f61',text:'#f5f3ea'},
 {id:'navy_orange',name:'Navy + Cam',note:'Phối 02 · guideline chủ đạo',logo:'assets/logos/logo-02.png',bg:'#0b1421',accent:'#ff791f',text:'#f5f3ea'},
 {id:'black_red',name:'Đen + Đỏ',note:'Phối 01 · đêm, sự kiện',logo:'assets/logos/logo-01.png',bg:'#121212',accent:'#f12d35',text:'#f6f1e8'},
 {id:'charcoal_gold',name:'Than + Vàng',note:'Phối 03 · Tết, sang trọng',logo:'assets/logos/logo-03.png',bg:'#1d201f',accent:'#d7b46a',text:'#f2ede1'},
 {id:'forest_cream',name:'Rừng + Kem',note:'Phối 04 · mùa xanh, thiên nhiên',logo:'assets/logos/logo-04.png',bg:'#0f2e27',accent:'#e77442',text:'#f4edd9'},
 {id:'cobalt_lime',name:'Cobalt + Chanh',note:'Phối 05 · hè, Pride, năng lượng',logo:'assets/logos/logo-05.png',bg:'#0a1d5e',accent:'#d7ff3f',text:'#ffffff'},
 {id:'cream_burgundy',name:'Kem + Đỏ rượu',note:'Phối 06 · nền sáng, thu–đông',logo:'assets/logos/logo-06.png',bg:'#f6efe3',accent:'#711e35',text:'#2a1a1f'}
];
export const themeById=id=>THEMES.find(t=>t.id===id)||THEMES[0];
export function applyTheme(id){
 const t=themeById(id);document.documentElement.dataset.theme=t.id;
 document.querySelectorAll('img[data-logo]').forEach(img=>{if(img.getAttribute('src')!==t.logo)img.src=t.logo;});
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',t.bg);
 try{localStorage.setItem('chich.theme',t.id);}catch{}
 return t;
}
