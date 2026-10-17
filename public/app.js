'use strict';
  const FALLBACK_CANDIDATES = [
    ['muslimin','01','Muslimin','#507e62'],
    ['hidayat','02','Muhammad Hidayat Nuryadin','#ba8d3c'],
    ['abdul-khamid','03','Abdul Khamid','#4d8390'],
    ['angga','04','Angga Nur Pramahardika','#b16d52'],
    ['santoso','05','M. Santoso','#8075a5'],
    ['syaifuddin','06','Syaifuddin Nizar','#7e9149'],
    ['rizky','07','Rizky','#b86b7b']
  ].map(function(c){return {id:c[0],number:c[1],name:c[2],color:c[3]};});
  const state = {
    profiles: FALLBACK_CANDIDATES, profilesReady: false, profileIndex: 0,
    results: null, inFlight: false, requestController: null, requestStarted: 0, lastError: '', stopped: false,
    refreshTimer: null, clockTimer: null, slideshowTimer: null, chartCheckTimer: null,
    paused: false, slideStarted: Date.now(), pausedElapsed: 0,
    chartReady: false, chart: null, chartLoading: false, resizeTimer: null
  };
  const $ = function(id){return document.getElementById(id);};
  const numberFormat = new Intl.NumberFormat('id-ID');
  const percentFormat = new Intl.NumberFormat('id-ID',{maximumFractionDigits:2});
  const timeFormat = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const dateFormat = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',weekday:'long',day:'numeric',month:'long',year:'numeric'});

  function updateConnectionStatus(status, message){
    $('connection-status').dataset.state = status;
    $('connection-text').textContent = message;
    $('sync-icon').classList.toggle('loading', state.inFlight);
  }
  function showNotice(message){
    $('notice').hidden = !message;
    $('notice').textContent = message || '';
  }
  function markFailure(message){
    state.lastError = message;
    updateConnectionStatus('error',state.results ? 'Koneksi gagal · data terakhir' : 'Belum terhubung');
    showNotice(message + (state.results ? ' Hasil terakhir dipertahankan; perhatikan waktu sinkronisasi.' : ' Angka akan tampil setelah sumber berhasil dibaca.'));
  }

  function validateResults(result){
    if (!result || result.ok !== true || !Number.isFinite(Date.parse(result.readAt))) return false;
    const s = result.statistics;
    if (!s || !Array.isArray(result.candidates) || result.candidates.length !== 7) return false;
    const counts = ['totalResponses','validVotes','duplicates','unmappedResponses','invalidMetadata','excludedResponses','candidateCount'];
    if (!counts.every(function(key){return Number.isSafeInteger(s[key]) && s[key]>=0;}) || s.candidateCount!==7) return false;
    if (s.totalResponses !== s.validVotes+s.excludedResponses || s.excludedResponses!==s.duplicates+s.unmappedResponses+s.invalidMetadata) return false;
    if (s.registeredVoters !== null && (!Number.isSafeInteger(s.registeredVoters) || s.registeredVoters<1)) return false;
    if (s.registeredVoters===null ? s.participation!==null : (!Number.isFinite(s.participation) || Math.abs(s.participation-s.validVotes/s.registeredVoters*100)>0.00001)) return false;
    const ids = new Set(); let total=0;
    for (const c of result.candidates){
      if (!FALLBACK_CANDIDATES.some(function(p){return p.id===c.id;}) || ids.has(c.id) || !Number.isSafeInteger(c.votes) || c.votes<0 || !Number.isFinite(c.percentage)) return false;
      const expected = s.validVotes ? c.votes/s.validVotes*100 : 0;
      if (Math.abs(c.percentage-expected)>0.00001) return false;
      ids.add(c.id); total+=c.votes;
    }
    return total===s.validVotes;
  }

  function applyMode(mode){
    const dummy=mode!=='production';
    document.querySelector('.provisional').textContent=dummy?'SIMULASI · DATA DUMMY':'HASIL SEMENTARA';
    document.querySelector('.footer p').textContent=dummy?'Simulasi menggunakan spreadsheet dummy.':'Hasil sementara. Penetapan hasil resmi oleh panitia.';
    document.title=(dummy?'[SIMULASI] ':'')+'JR3 Live Quick Count';
  }
  async function loadResults(){
    if(state.stopped || state.inFlight)return;
    if(navigator.onLine===false){markFailure('Perangkat tidak terhubung ke internet.');return;}
    state.inFlight=true;state.requestStarted=Date.now();
    const controller=new AbortController();state.requestController=controller;
    const timeout=setTimeout(function(){controller.abort();},15000);
    updateConnectionStatus('loading','Menyinkronkan…');
    try{
      const response=await fetch('/api/results',{signal:controller.signal,headers:{Accept:'application/json'}});
      const result=await response.json();
      if(state.stopped)return;
      applyMode(result.mode);
      if(!response.ok || !result.ok){markFailure(result.error?.message || 'Sumber data belum dapat dibaca.');return;}
      if(!validateResults(result)){markFailure('Hasil agregat tidak lolos pemeriksaan konsistensi.');return;}
      if(state.results && Date.parse(result.readAt)<Date.parse(state.results.readAt)){markFailure('Pembaruan lebih lama dari hasil yang telah diterima.');return;}
      state.results=result;state.lastError='';renderStatistics(result.statistics);renderBarChart();
      $('last-sync').textContent=timeFormat.format(new Date(result.readAt))+' WIB · '+new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short'}).format(new Date(result.readAt));
      updateConnectionStatus('connected','Terhubung · live');
      showNotice(result.statistics.registeredVoters!==null && result.statistics.validVotes>result.statistics.registeredVoters?'Jumlah rumah dengan suara sah melebihi pemilih terdaftar. Panitia perlu memeriksa daftar dan alamat.':'');
    }catch(error){
      if(!state.stopped)markFailure(error.name==='AbortError'?'Sinkronisasi terlalu lama. Akan dicoba kembali.':'Koneksi ke sumber data gagal.');
    }finally{
      clearTimeout(timeout);state.inFlight=false;state.requestController=null;$('sync-icon').classList.remove('loading');
    }
  }

  function renderStatistics(stats){
    [['stat-valid','validVotes'],['stat-responses','totalResponses'],['stat-excluded','excludedResponses'],['stat-duplicates','duplicates'],['stat-unmapped','unmappedResponses'],['stat-metadata','invalidMetadata']].forEach(function(pair){$(pair[0]).textContent=numberFormat.format(stats[pair[1]]);});
    $('stat-registered').textContent=stats.registeredVoters===null?'Belum tersedia':numberFormat.format(stats.registeredVoters)+' rumah / KK';
    $('stat-participation').textContent=stats.participation===null?'Belum tersedia':percentFormat.format(stats.participation)+'%';
  }

  function renderBarChart(){
    const values = new Map(state.results ? state.results.candidates.map(function(c){return [c.id,c];}) : []);
    const list=document.createDocumentFragment();
    state.profiles.forEach(function(c){
      const result=values.get(c.id);
      const row=document.createElement('li');row.className='bar-row';row.dataset.candidate=c.id;
      const name=document.createElement('span');name.className='bar-name';
      const order=document.createElement('span');order.className='bar-number';order.textContent=c.number;
      name.append(order,document.createTextNode(c.name));
      const track=document.createElement('div');track.className='bar-track';track.setAttribute('aria-hidden','true');
      const fill=document.createElement('div');fill.className='bar-fill';fill.style.backgroundColor=c.color;fill.style.width=result?result.percentage+'%':'0%';track.append(fill);
      const value=document.createElement('span');value.className='bar-value';
      value.textContent=result?percentFormat.format(result.percentage)+'%':'—';
      row.append(name,track,value);list.append(row);
    });
    $('bar-list').replaceChildren(list);
    $('plot').classList.remove('chart-ready');
    if(!state.chartReady || !state.results || window.innerWidth<=950) return;
    try {
      const data = new google.visualization.DataTable();
      data.addColumn('string','Calon');data.addColumn('number','Persentase');
      data.addColumn({type:'string',role:'style'});data.addColumn({type:'string',role:'annotation'});
      state.profiles.forEach(function(c){const r=values.get(c.id);data.addRow([c.number+'  '+c.name,r.percentage/100,c.color,percentFormat.format(r.percentage)+'%']);});
      if(!state.chart){
        state.chart=new google.visualization.BarChart($('bar-chart'));
        google.visualization.events.addListener(state.chart,'ready',function(){if(!state.stopped)$('plot').classList.add('chart-ready');});
        google.visualization.events.addListener(state.chart,'error',function(){$('plot').classList.remove('chart-ready');});
      }
      const width=$('plot').clientWidth;
      state.chart.draw(data,{
        backgroundColor:'transparent',fontName:'Segoe UI',legend:'none',enableInteractivity:false,
        height:$('plot').clientHeight,width:width,bar:{groupWidth:'38%'},
        chartArea:{left:Math.min(295,Math.round(width*.34)),top:12,right:145,bottom:34},
        hAxis:{minValue:0,maxValue:1,viewWindow:{min:0,max:1},format:'percent',ticks:[0,0.25,0.5,0.75,1],textStyle:{color:'#929b89',fontSize:11},baselineColor:'#e7e9df',gridlines:{color:'#eef0e8'}},
        vAxis:{textStyle:{color:'#385340',fontSize:width>850?18:14},baselineColor:'transparent',gridlines:{color:'transparent'}},
        annotations:{alwaysOutside:true,stem:{color:'transparent',length:8},textStyle:{fontSize:width>850?18:14,color:'#385340',auraColor:'none'}},
        tooltip:{trigger:'none'}
      });
    }catch(_){$('plot').classList.remove('chart-ready');}
  }

  function renderCandidateProfile(index){
    if(!state.profilesReady)return;
    state.profileIndex=(index+state.profiles.length)%state.profiles.length;
    const c=state.profiles[state.profileIndex];
    $('candidate-number').textContent=c.number;
    $('candidate-name').textContent=c.name;$('candidate-address').textContent=c.address;
    $('candidate-support').textContent='Blok pengusung: '+(c.supportingBlock||'Belum tersedia');
    $('candidate-vision').textContent=c.vision;
    $('candidate-missions').replaceChildren.apply($('candidate-missions'),c.missions.map(function(mission){const li=document.createElement('li');li.textContent=mission;return li;}));
    $('candidate-photo').hidden=true;$('photo-unavailable').hidden=false;$('photo-unavailable').textContent='Memuat poster asli…';
    $('candidate-photo').alt='Poster resmi calon '+c.number+' '+c.name;
    $('candidate-photo').onload=function(){this.hidden=false;$('photo-unavailable').hidden=true;};
    $('candidate-photo').onerror=function(){this.hidden=true;$('photo-unavailable').hidden=false;$('photo-unavailable').textContent='Poster asli belum dapat ditampilkan';};
    if(c.photo && /^\/assets\/candidates\/[-a-z]+\.jpg$/.test(c.photo))$('candidate-photo').src=c.photo;
    else{$('candidate-photo').removeAttribute('src');$('photo-unavailable').textContent='Poster asli belum tersedia';}
    $('profile-position').textContent=c.number+' / 07';$('profile-scroll').scrollTop=0;
    $('profile-dots').replaceChildren.apply($('profile-dots'),state.profiles.map(function(profile,i){
      const button=document.createElement('button');button.type='button';button.className='profile-dot';button.setAttribute('aria-label','Tampilkan '+profile.name);button.setAttribute('aria-current',String(i===state.profileIndex));
      button.addEventListener('click',function(){showProfile(i);});return button;
    }));
  }
  function showProfile(index){renderCandidateProfile(index);state.slideStarted=Date.now();state.pausedElapsed=0;$('slideshow-progress').style.width='0%';}
  function startCandidateSlideshow(){
    if(state.slideshowTimer)clearInterval(state.slideshowTimer);
    state.slideshowTimer=setInterval(function(){
      if(state.paused || state.stopped || !state.profilesReady)return;
      const elapsed=Date.now()-state.slideStarted;
      if(elapsed>=15000)showProfile(state.profileIndex+1);
      else $('slideshow-progress').style.width=Math.min(100,elapsed/150)+'%';
    },250);
  }
  function togglePause(){
    state.paused=!state.paused;
    if(state.paused)state.pausedElapsed=Date.now()-state.slideStarted;
    else state.slideStarted=Date.now()-state.pausedElapsed;
    $('pause-button').textContent=state.paused?'▶':'Ⅱ';
    $('pause-button').setAttribute('aria-pressed',String(state.paused));
    $('pause-button').setAttribute('aria-label',state.paused?'Lanjutkan slideshow':'Jeda slideshow');
  }
  async function toggleFullscreen(){
    if(document.fullscreenElement){await document.exitFullscreen().catch(function(){});return;}
    if(document.body.classList.contains('projector')){document.body.classList.remove('projector');updateFullscreenButton();return;}
    document.body.classList.add('projector');updateFullscreenButton();
    if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen();}catch(_){/* Layout proyektor tetap tersedia jika fullscreen ditolak browser. */}}
    renderBarChart();
  }
  function updateFullscreenButton(){const active=document.body.classList.contains('projector');$('fullscreen-button').setAttribute('aria-pressed',String(active));$('fullscreen-button').setAttribute('aria-label',active?'Keluar mode proyektor':'Aktifkan mode proyektor');}

  function tickClock(){
    const now=new Date();$('clock-time').textContent=timeFormat.format(now)+' WIB';$('clock-date').textContent=dateFormat.format(now);
    if(state.inFlight && Date.now()-state.requestStarted>30000)updateConnectionStatus('stale',state.results?'Sinkronisasi lambat · data terakhir':'Sinkronisasi lambat');
    else if(state.results && !state.inFlight && !state.lastError && Date.now()-Date.parse(state.results.readAt)>25000)updateConnectionStatus('stale','Data lama · menunggu sinkronisasi');
  }
  function checkCharts(){
    if(state.chartLoading || !window.google || !google.charts)return;
    state.chartLoading=true;clearInterval(state.chartCheckTimer);state.chartCheckTimer=null;
    google.charts.load('current',{packages:['corechart'],language:'id'});
    google.charts.setOnLoadCallback(function(){state.chartReady=true;if(!state.stopped)renderBarChart();});
  }
  function startAutoRefresh(){
    if(state.refreshTimer)clearInterval(state.refreshTimer);
    loadResults();state.refreshTimer=setInterval(loadResults,10000);
  }
  async function loadProfiles(){
    try{
      const response=await fetch('/candidates.json');
      if(!response.ok)throw new Error('Profiles unavailable');
      const profiles=await response.json();
      if(state.stopped)return;
      if(!Array.isArray(profiles)||profiles.length!==7||!profiles.every(function(c,i){return c.id===FALLBACK_CANDIDATES[i].id&&Array.isArray(c.missions);}))throw new Error('Invalid profiles');
      state.profiles=profiles;state.profilesReady=true;renderCandidateProfile(state.profileIndex);renderBarChart();state.slideStarted=Date.now();
    }catch(_){$('candidate-name').textContent='Profil belum dapat dimuat';$('photo-unavailable').textContent='Poster asli belum dapat dimuat';}
  }
  function stopTimers(){
    state.stopped=true;
    if(state.requestController)state.requestController.abort();
    ['refreshTimer','clockTimer','slideshowTimer','chartCheckTimer'].forEach(function(key){clearInterval(state[key]);state[key]=null;});
    clearTimeout(state.resizeTimer);
  }
  function startTimers(){
    state.stopped=false;tickClock();state.clockTimer=setInterval(tickClock,1000);
    startCandidateSlideshow();startAutoRefresh();
    if(!state.chartReady && !state.chartLoading){state.chartCheckTimer=setInterval(checkCharts,300);checkCharts();}
  }
  $('previous-button').addEventListener('click',function(){showProfile(state.profileIndex-1);});
  $('next-button').addEventListener('click',function(){showProfile(state.profileIndex+1);});
  $('pause-button').addEventListener('click',togglePause);
  $('fullscreen-button').addEventListener('click',toggleFullscreen);
  document.addEventListener('fullscreenchange',function(){document.body.classList.toggle('projector',!!document.fullscreenElement);updateFullscreenButton();renderBarChart();});
  window.addEventListener('resize',function(){clearTimeout(state.resizeTimer);state.resizeTimer=setTimeout(renderBarChart,180);});
  window.addEventListener('offline',function(){markFailure('Perangkat tidak terhubung ke internet.');});
  window.addEventListener('online',loadResults);
  window.addEventListener('pagehide',stopTimers);
  window.addEventListener('pageshow',function(event){if(event.persisted){startTimers();if(!state.profilesReady)loadProfiles();}});
  renderBarChart();loadProfiles();startTimers();
