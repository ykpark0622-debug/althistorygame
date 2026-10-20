'use strict';

// Editorial corrections to sparse Cliopatria frames on the existing balanced
// provinces. Bounds below are deliberately coarse province-selection masks,
// not source-derived historical boundary lines. See early-review.md.
module.exports = function earlyCorrections(ctx) {
  const {year,lon,lat} = ctx;
  if (![1444,1550,1648].includes(year)) return null;
  const iso = String(ctx.modernOwner || ctx.iso || '').toLowerCase();
  const raw = String(ctx.chosenName || ctx.name || '');
  const name = raw.replace(/^\((.*)\)$/,'$1');
  const gap = !name || /경계 미상|communities|unmapped|unknown/i.test(name);
  const box = (w,s,e,n)=>lon>=w&&lon<=e&&lat>=s&&lat<=n;
  const result = (n, note, influence)=>({name:n,...(influence?{influence}:{}),note});

  if(year===1444 && /Kalmar Union/.test(name)) {
    const member = iso==='dnk'?'Kingdom of Denmark':['nor','isl','fro'].includes(iso)||(iso==='gbr'&&lat>58.8)?'Kingdom of Norway':['swe','fin','ala'].includes(iso)||(iso==='rus'&&box(27.5,59.8,30.3,61.5))?'Kingdom of Sweden':iso==='deu'&&lat>54?'Duchy of Schleswig':null;
    if(member) return result(member,'1444: constituentkingdoms oftheKalmardynasticunion shownasplayablemembers, notindependentsovereignty.','Kalmar Union');
  }
  if(year===1444&&iso==='esp'&&box(-2.5,42.2,-0.65,43.35)&&/Castile|Aragon/.test(name))
    return result('Kingdom of Navarre','1444: Navarre remainsaseparatekingdom; currentNavarraprovince is a coarseapproximation.');
  if(year===1550 && name==='House of Jagiellon') {
    const crown = iso==='pol'||(iso==='ukr'&&lon<25.5&&lat<51);
    return result(crown?'Kingdom of Poland':'Grand Duchy of Lithuania','1550: theJagielloniandynasticunion is separatedintoPoland/Lithuania beforethe1569Commonwealth; inheritedprovinceboundaries are approximate.','Jagiellonian union');
  }
  if(year===1550&&['bel','lux','nld'].includes(iso)&&/Habsburg|Spain/.test(name))
    return result('Habsburg Netherlands','1550: theNetherlandsremainunderCharlesV, beforePhilipIIinherits1555–1556.','Habsburg Monarchy');
  if(year===1550&&name==='Golden Horde')
    return result('Northern Yuan','1550: the sourceGoldenHordefeatureis aMongolianpolygon; correctedtoNorthernYuanMongols.');
  if(year===1550&&iso==='jpn') {
    if(lat>=41.7) return result('Ainu communities','1550: HokkaidoAinucommunities; southernWajinsettlements are belowthemapresolution.');
    if(lat<30.0&&lon<131.5) return result('Ryukyu Kingdom','1550: Ryukyuislands; the sourceMaynilapolygon accidentallyincludesOkinawa.');
    if(gap||name==='Maynila') return result('Warring States Japan','1550: Japaneseisland/coastalgridgaps; daimyo-levelboundariesnotresolvedbythissource.');
  }
  if(year===1550&&(iso==='kor'||iso==='prk'))
    return result('Joseon','1550: Joseoncoastal/bordergridrepair; tributaryrelationshiptoMingdoesnotchangepoliticalownership.');
  if(year===1550&&iso==='chn'&&gap&&box(105.0,20.0,124.0,41.0))
    return result('Ming Dynasty','1550: repairinterior/coastalMinggaps leftbycoarsehistoricalpolygons, notwholemodernChina.');

  if (year===1444 && name==='Serbian Empire') {
    if (iso==='mkd' || (iso==='grc' && lat<41.5))
      return result('Ottoman Empire','1444: an obsolete maximal Serbian Empire footprint is not retained in Ottoman Macedonia.');
    if (iso==='alb') {
      if (lat>41.8&&lon<19.8) return result('Republic of Venice','1444: Venetian Shkoder and coastal possessions.');
      if (lat>=41.0) return result('League of Lezhë','1444: Albanian principalities allied under Skanderbeg; coarse balanced-province grouping, not a centralized nation-state.');
      return result('Ottoman Empire','1444: southern Albania outside the Lezhe grouping.');
    }
    return result('Serbian Despotate','1444: the Serbian Empire had fragmented; surviving Serbian polity is the Despotate.');
  }
  if (year===1444 && iso==='alb' && box(19.6,41.2,20.5,41.9) && name==='Ottoman Empire')
    return result('League of Lezhë','1444: restore Kruje/Diber core of the Lezhe military league, using a balanced-grid approximation.');
  if (year===1444 && iso==='tur' && box(28.55,40.83,29.10,41.23))
    return result('Byzantine Empire','1444: Constantinople was not conquered until1453; city province necessarily approximates surviving territory.');

  if (year===1648) {
    if (name==='Commonwealth of England')
      return result('England Parliamentary administration','1648: the Commonwealth was declared inMay1649. This label marks Parliamentarian control during the civil wars.');
    if (name==='Astrakhan Khanate')
      return result(lat>=49.8?'Tsardom of Russia':'Don Cossack Host','1648: source mislabels a Don-steppe polygon as Astrakhan. Astrakhan khanate itself had been annexed in1556; Don-host grouping is approximate.');
    if (name==='Golden Horde')
      return result('Inner Asian steppe communities','1648: source GoldenHorde polygon is actually inMongolia/InnerAsia; omitted from theEuropecrop and treated as uncertain regional communities.');
    if (name==='Republic of Florence')
      return result('Grand Duchy of Tuscany','1648: Florence is the centre of theGrandDuchyofTuscany, established1569.');
    if (name==='Duchy of Bavaria')
      return result('Electorate of Bavaria','1648: Bavaria had held the electoral dignity since1623.','Holy Roman Empire');
    if (name==='Ahmadnagar Sultanate')
      return result('Mughal Empire','1648: Ahmadnagar had been conquered in1636. Outside theEuropecrop.');
  }
  if (year===1550 && (name==='Mughal Empire'||name==='Sur Empire') && box(74.0,24.0,89.5,31.8))
    return result('Sur Empire','1550: northernIndianSurcore; Humayun did not regainDelhi until1555.');
  if(year===1550&&name==='Republic of Florence')
    return result('Duchy of Florence','1550: Florencehadbecomeadu chyin1532, beforetheGrandDuchyofTuscany1569.');

  // Italy's generic imperial-estate polygons are particularly coarse in the
  // source. Existing balanced Italian provinces permit these historical cores
  // to be exposed without changing any geometry or inventing small map dots.
  if(iso==='ita'&&/Holy Roman Empire/.test(name)) {
    if(box(10.3,44.9,11.25,45.45)) return result(year===1444?'Marquisate of Mantua':'Duchy of Mantua','MantuaGonzagacore ontheexistingbalancedprovince.','Holy Roman Empire');
    if(box(10.2,43.7,10.65,44.18)) return result('Republic of Lucca','Luccaretainsitsownrepublic; sourcegenericimperialarea.','Holy Roman Empire');
    if(box(10.7,42.5,11.9,43.4)&&year<1648) return result('Republic of Siena','Sienaremainedaseparaterepublicuntil1555; modernSiena/Grossetoprovincesapproximateit.');
    if(box(9.4,44.4,10.3,45.1)&&year>=1550) return result('Duchy of Parma','ParmaandPiacenzaduchy, established1545; province-scaleapproximation.');
    if(box(10.35,44.3,11.3,44.9)) return result(year===1444?'House of Este':year===1550?'Duchy of Ferrara':'Duchy of Modena and Reggio','EsteModena/Reggiocore; FerrarawaslosttoPapacy1598.','Holy Roman Empire');
    if(box(11.4,44.55,12.2,45.1)&&year<1648) return result(year===1444?'House of Este':'Duchy of Ferrara','Ferraracore; Es tepossessionscombinedbeforethed ucalrank1471.');
    if(box(10.6,45.7,11.7,46.7)) return result('Prince-Bishopric of Trent','Trentretainedprincebishopricstatusuntil1803.','Holy Roman Empire');
    if(box(9.8,44.1,10.25,44.45)) return result('Lordship of Massa and Carrara','SmallMalaspina/Cybolordshipgroup, balancedprovinceapproximation.','Holy Roman Empire');
    if(box(7.0,44.15,8.1,44.8)&&year===1444) return result('Marquisate of Saluzzo','SaluzzocorewithinmodernCuneoprovince; surroundingSavoyterritoryissimplified.','Holy Roman Empire');
    if(box(7.8,44.0,8.6,44.6)&&year===1648) return result('Republic of Genoa','SavonaisGenoesein1648; sourcegenericHREmisassignment.');
  }
  if(iso==='ita'&&name==='Papal States') {
    if(year<1648&&box(12.35,43.4,13.05,43.95)) return result('Duchy of Urbino','UrbinoonlypassedtoPapacyin1631; existingPesaroprovinceapproximation.');
    if(year===1550&&box(11.5,44.55,12.15,44.95)) return result('Duchy of Ferrara','FerrarapassedtoPapacyin1598, notbefore1550.');
  }

  // Larger Iberian dependencies stay playable, with their imperial connection
  // recorded as influence rather than implying independent sovereignty.
  if (year>=1550 && /^(Kingdom of Spain|Spanish Empire)$/.test(name)) {
    if (['bel','lux'].includes(iso) || (iso==='nld'&&year===1550))
      return result('Spanish Netherlands','SpanishNetherlands shown separately for editing, underSpanishinfluence.','Kingdom of Spain');
    if (iso==='ita') {
      if (lat<38.5&&lon>11.3) return result('Kingdom of Sicily','SpanishSicily shown as a playable dependent kingdom.','Kingdom of Spain');
      if (box(8.0,38.7,10.0,41.5)) return result('Kingdom of Sardinia','SpanishSardinia shown as a playable dependent kingdom.','Kingdom of Spain');
      if (lat<42.6&&lon>12.7) return result('Kingdom of Naples','SpanishNaples shown as a playable dependent kingdom.','Kingdom of Spain');
      if (box(8.35,44.65,10.7,46.8)) return result('Duchy of Milan','SpanishMilan shown as a playable dependency; coarse province mask.','Kingdom of Spain');
    }
    if(year===1550 && lon<-32&&lat<33&&lat>-58) {
      if(lat>=8.0) return result('Viceroyalty of New Spain','1550: separateNewSpain for editing;Spanishcontrol, not independentsovereignty.','Kingdom of Spain');
      return result('Viceroyalty of Peru','1550: separatePeruviceroyalty for editing; colonialclaims and effectivecontrol are simplified.','Kingdom of Spain');
    }
  }
  if(/^(Holy Roman Empire|Holy Roman Empire Minor States)$/.test(name) && iso==='deu') {
    // Only fill the source's generic HRE-minor-state area. Never overwrite
    // existing precise Bavaria/Saxony/Brandenburg/Habsburg assignments.
    if(box(8.3,47.8,10.2,49.2)) return result(year===1444?'County of Württemberg':'Duchy of Württemberg','ApproximateWurttembergcore within genericHREsmallstatepolygon.','Holy Roman Empire');
    if(box(7.2,48.95,8.65,49.95)) return result('Electoral Palatinate','1648: approximateRhenishPalatinatecore within genericHREsmallstatepolygon.','Holy Roman Empire');
    if(box(7.5,47.55,8.7,48.95)) return result('Margraviate of Baden','1648: approximateBaden grouping; dividedbranches are combined.','Holy Roman Empire');
    if(box(8.0,50.0,10.0,51.6)) return result(year===1648?(lat>=50.8?'Landgraviate of Hesse-Kassel':'Landgraviate of Hesse-Darmstadt'):'Landgraviate of Hesse','ApproximateHessianprincipalities within genericHREsmallstatepolygon; subdivisiononlyafter1567.','Holy Roman Empire');
    if(box(9.0,52.0,11.35,53.35)) return result('Duchy of Brunswick-Lüneburg','1648: approximateWelfduchies; internalbranches combined for map scale.','Holy Roman Empire');
    if(box(10.4,53.35,13.15,54.6)) return result('Duchy of Mecklenburg','1648: approximateMecklenburgduchies, combined for scale.','Holy Roman Empire');
    if(box(6.3,50.5,7.85,51.45)) return result('Electorate of Cologne','ApproximateCologneelectoralcore within genericHREsmallstatepolygon.','Holy Roman Empire');
    return result('Holy Roman Empire Minor States','1648: retainotherunresolvedimperialestatesratherthaninventmodernGermany.','Holy Roman Empire');
  }

  if (!gap) return null;

  // Missing coastal/island geometry is repaired conservatively where the
  // political affiliation is well known. This is not a modern-country rename.
  if (iso==='dnk') return result(year===1444?'Kingdom of Denmark':'Denmark-Norway','CoastalDanishislands omitted from historicalsourcecoastline.');
  if (iso==='nor') return result(year===1444?'Kingdom of Norway':'Denmark-Norway','CoastalNorwegianislands omitted from historicalsourcecoastline.');
  if (iso==='fin'&&lon<24.0) return result('Kingdom of Sweden','SwedishFinland includingAlandislands; historicalcoastlinegap.');
  if (iso==='swe') return result(year===1648?'Swedish Empire':'Kingdom of Sweden','Swedishhistoricalcoastlinegap.');
  if (iso==='est'&&lon<25.5) return result(year===1648?'Swedish Empire':'Livonian Confederation','Balticislandcoastlinegap.');
  if (iso==='kor'||iso==='prk') return result('Joseon','Koreancoastalprovinces omitted bycoarsesource.');
  if (iso==='twn'&&year===1550) return result('Taiwan Indigenous communities','1550: Taiwan was notMingadministrativeterritory; localcommunities, boundariesuncertain.');
  if (iso==='prt') return result('Kingdom of Portugal','Portugueseisland/coastlinegap.');
  if (iso==='mco') return result('Principality of Monaco','Monaco below sourcecoastresolution.');
  if (iso==='mti'||iso==='mlt') return result(year===1444?'Crown of Aragon':'Knights Hospitaller','Malta: AragoneseSicily before theOrderarrived1530.');
  if (iso==='egy'&&lat>29.5) return result(year===1444?'Mamluk Sultanate':'Ottoman Empire','EgyptianMediterraneancoastalprovinces omitted bysource.');
  if (iso==='lbn'&&lon<36.5) return result(year===1444?'Mamluk Sultanate':'Ottoman Empire','Levantcoastgap; localemirates/jurisdictionscombinedatthisscale.');
  if (iso==='aze'&&lat<39.5) return result(year===1444?'Qara Qoyunlu':'Safavid Dynasty','Lankarancoastgap atsourceedge.');
  if (iso==='hrv'&&lon<17.5&&lat<45.1) return result('Republic of Venice','Dalmatiancoastalislands; balancedprovincesapproximateVenetianpossessions.');
  if (iso==='tur'&&lon<45) return result(year===1444?(lon>36&&lat>40.0?'Empire of Trebizond':'Ottoman Empire'):'Ottoman Empire','Anatoliancoastislandgap; sourceassignedneighbouringterritoryretainedelsewhere.');
  if (iso==='gbr') {
    if(lon<-5&&lat>54) return result(year===1444?'Gaelic Irish lordships':'Irish Catholic Confederation','NorthernIrelandnotamodernUKconstituent; coarseGaeliclordship/Confederateadministrationgroup.');
    if(lat>58.8&&year===1444) return result('Kingdom of Norway','Orkney/Shetlandbeforetransfer toScotland1468–1469.');
    return result(lat>55.6?'Kingdom of Scotland':year===1648?'England Parliamentary administration':'Kingdom of England','Britishcoastal/islandsourcegap.');
  }
  if (iso==='irl') return result(year===1444?'Gaelic Irish lordships':year===1648?'Irish Catholic Confederation':'Kingdom of Ireland','Irishsourcegaps groupedbyperiod; individualGaelicchiefdoms notfullyresolved.');
  if (iso==='jeY'.toLowerCase()||iso==='ggy'||iso==='imn') return result('Kingdom of England','EnglishCrownislanddependencies atmapscale.');
  if (iso==='deu'&&lat>54) return result(year===1444?'Duchy of Holstein':'Duchy of Holstein','Holsteincoastgap.','Holy Roman Empire');
  if (iso==='esp'&&lon<-5&&lat<36) return result(year===1648?'Kingdom of Spain':'Kingdom of Portugal','CeutawasPortuguesein1444/1550;1648remainedloyaltoSpain.');
  if (iso==='esp'&&lat>36) return result(year===1444?'Crown of Castile':'Kingdom of Spain','Spanishcoastal/islandsourcegap; crownassignmentsapproximate.');
  return null;
};
