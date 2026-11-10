// Default gallery, story and updates for campaigns that have none saved yet.
// Copied from the website's app/campaign/page.js so the editor starts from what the site shows.

const SITE = 'https://www.sikhaid.ngo';
const ibb = (path) => SITE + '/api/img?src=' + encodeURIComponent('https://i.ibb.co/' + path);

const IMG = {
  logo: SITE + '/sikhaidLogo.webp',
  assam1: ibb('zWXc5WPS/IMG-1877.webp'), assam2: ibb('ymN4S1Yq/IMG-2200.webp'), assam3: ibb('Kg1fJyy/IMG-2224.webp'),
  assam4: ibb('qVMnqg1/IMG-1864.webp'), assam5: ibb('84sqmnyk/IMG-1807.webp'), assam6: ibb('twFzLXhg/DSC-3910.webp'),
  assam7: ibb('LdmSnCnT/DSC-3829.webp'), assam8: ibb('2YKbjxLM/DSC-3891.webp'),
  food: SITE + '/gallery/gallery-151-community-food.webp', langar: SITE + '/gallery/gallery-147-langar-meals.webp',
  fooddist: SITE + '/gallery/gallery-148-food-distribution.webp', pads: SITE + '/gallery/gallery-153-sanitary-pads.webp',
  hygiene: SITE + '/gallery/gallery-154-hygiene-workshop.webp', ration: SITE + '/gallery/gallery-164-ration-kits.webp',
  blanket: SITE + '/campaigns-bg/mission-blanket.webp', health: SITE + '/campaigns-bg/impact-healthcare.webp',
  ratha1: SITE + '/annapurna-seva/ratha-yatra-hero-1.webp', ratha4: SITE + '/annapurna-seva/ratha-yatra-hero-4.webp',
  ratha6: SITE + '/annapurna-seva/ratha-yatra-hero-6.webp',
  merch1: SITE + '/merch-1.jpeg', merch2: SITE + '/merch-2.jpeg',
  badshah: 'https://i.ibb.co/SXznFG7r/IMG-20251116-193328-125.webp',
  jaspreet: SITE + '/personalities/jaspreet-singh.webp', banita: SITE + '/personalities/banita-sandhu.webp'
};

export function getCampaignGallery(camp) {
  if (camp?.gallery && Array.isArray(camp.gallery) && camp.gallery.length > 0) {
    return camp.gallery;
  }
  const baseImg = camp?.img || IMG.food;
  const t = ((camp?.type || '') + ' ' + (camp?.group || '') + ' ' + (camp?.category || '') + ' ' + (camp?.slug || '')).toLowerCase();

  if (t.includes('flood') || t.includes('disaster') || t.includes('emergency') || t.includes('landslide')) {
    return [
      { src: baseImg, caption: `${camp?.title || 'Relief'} — Active Ground Response`, tag: 'Ground Zero' },
      { src: IMG.assam1, caption: 'Volunteers navigating submerged villages with boat rations', tag: 'Boat Rescue' },
      { src: IMG.assam2, caption: 'Isolated families receiving emergency ration kits', tag: 'Submerged Hamlets' },
      { src: IMG.assam3, caption: 'Direct dry ration kits & pure drinking water distribution', tag: 'Direct Aid' },
      { src: IMG.assam4, caption: 'Community evacuation to safe high-ground relief camps', tag: 'Evacuation' },
      { src: IMG.assam5, caption: 'Emergency medical supplies and water purification kits', tag: 'Healthcare' },
      { src: IMG.assam6, caption: 'Safe shelter tarpaulins, blankets & survival kits distributed', tag: 'Shelter Kits' },
      { src: IMG.assam7, caption: 'Frontline relief team moving through flood corridors', tag: 'Field Operations' },
      { src: IMG.assam8, caption: 'Door-to-door seva reaching the most vulnerable elderly', tag: 'Ground Seva' },
      { src: IMG.langar, caption: 'Hot langar meals cooked 24/7 at relief camp kitchens', tag: 'Langar Sewa' },
      { src: IMG.fooddist, caption: 'Nutritious hot meals served to displaced families daily', tag: 'Daily Feeding' },
      { src: IMG.ration, caption: 'Emergency relief supplies delivered directly to doorsteps', tag: 'Relief Kits' }
    ];
  }

  if (t.includes('hunger') || t.includes('food') || t.includes('langar')) {
    return [
      { src: baseImg, caption: `${camp?.title || 'Langar'} — Community Langar Seva`, tag: 'Community' },
      { src: IMG.langar, caption: 'Fresh hot meals cooked with love, hygiene, and dignity', tag: 'Langar Sewa' },
      { src: IMG.food, caption: 'Large-scale food distribution across underserved settlements', tag: 'Distribution' },
      { src: IMG.fooddist, caption: 'Serving daily warm meals to daily-wage workers & children', tag: 'Daily Feeding' },
      { src: IMG.ratha1, caption: 'Annapurna Seva: Hydration, meals, and emergency packs', tag: 'Relief Hub' },
      { src: IMG.ratha4, caption: 'Volunteers serving fresh water & energy food packs', tag: 'Hydration' },
      { src: IMG.ratha6, caption: 'Kitchen volunteers preparing large cauldrons of dal & rice', tag: 'Kitchen Seva' },
      { src: IMG.ration, caption: 'Dry ration kits delivered directly to vulnerable families', tag: 'Ration Kits' },
      { src: IMG.assam3, caption: 'Nutritional grocery bags given to struggling households', tag: 'Family Support' },
      { src: IMG.blanket, caption: 'Night food drives accompanied by warm blankets', tag: 'Night Relief' },
      { src: IMG.health, caption: 'Clean nutrition and wellness support for patients', tag: 'Nutrition' },
      { src: IMG.assam7, caption: 'Mobile langar van reaching remote outskirts', tag: 'Mobile Langar' }
    ];
  }

  if (t.includes('health') || t.includes('medical') || t.includes('spot') || t.includes('hygiene') || t.includes('oxygen')) {
    return [
      { src: baseImg, caption: `${camp?.title || 'Healthcare'} — Medical Mission`, tag: 'Health Aid' },
      { src: IMG.health, caption: 'Mobile health van reaching remote villages with free care', tag: 'Mobile Clinic' },
      { src: IMG.hygiene, caption: 'Preventive healthcare checkups and medicine dispensing', tag: 'Diagnostics' },
      { src: IMG.pads, caption: 'Distributing essential menstrual hygiene and dignity supplies', tag: 'Hygiene' },
      { src: IMG.assam5, caption: 'Doctor consultations and vital checks on the frontlines', tag: 'Field Doctors' },
      { src: IMG.ration, caption: 'Nutritional food supplements for recovering patients', tag: 'Nutrition' },
      { src: IMG.assam3, caption: 'Field volunteers facilitating emergency care on ground', tag: 'Patient Care' },
      { src: IMG.assam8, caption: 'Elderly patients receiving routine health assessments', tag: 'Elderly Care' },
      { src: IMG.langar, caption: 'Warm recuperation meals provided to clinic visitors', tag: 'Nourishment' },
      { src: IMG.blanket, caption: 'Sterile thermal blankets distributed for winter clinics', tag: 'Comfort Kits' }
    ];
  }

  return [
    { src: baseImg, caption: `${camp?.title || 'Mission'} — On-Ground Seva`, tag: 'Active Mission' },
    { src: IMG.langar, caption: 'Hot langar meals and dry provisions for vulnerable hamlets', tag: 'Food Aid' },
    { src: IMG.blanket, caption: 'Winter blankets and shelter tarpaulins distributed', tag: 'Shelter' },
    { src: IMG.health, caption: 'First-aid, essential medicines and health checkups', tag: 'Healthcare' },
    { src: IMG.assam1, caption: 'Emergency response units deploying to urgent distress calls', tag: 'Rapid Response' },
    { src: IMG.assam3, caption: 'Dedicated SikhAid volunteers delivering direct assistance', tag: 'Volunteers' },
    { src: IMG.assam5, caption: 'Hygiene kits, clean drinking water, and sanitization', tag: 'Sanitation' },
    { src: IMG.ration, caption: 'Emergency relief supplies delivered directly to doorsteps', tag: 'Relief Kits' },
    { src: IMG.food, caption: 'Wholesome community meals served with unconditional love', tag: 'Community Langar' },
    { src: IMG.fooddist, caption: 'Frontline teams ensuring no one sleeps hungry', tag: 'Food Drive' }
  ];
}

// Generates the strict paragraph structure requested:
// Paragraph 1: 200-300 words
// Image 1
// Paragraph 2: 200-300 words
// Image 2
// Paragraph 3: 100-200 words
// Image 3
export function getCampaignStoryBlocks(camp) {
  const edited = Object.fromEntries(Object.entries(camp?.storyOverride || {}).filter(([, value]) => value));
  return { ...standardStoryBlocks(camp), ...edited };
}

function standardStoryBlocks(camp) {
  const t = ((camp?.type || '') + ' ' + (camp?.group || '') + ' ' + (camp?.category || '') + ' ' + (camp?.title || '')).toLowerCase();
  const loc = camp?.location || 'India';
  const name = camp?.title || 'Humanitarian Mission';

  if (t.includes('flood') || t.includes('disaster') || t.includes('emergency') || t.includes('landslide')) {
    return {
      p1: `Across the vast rural river belts and low-lying settlements of ${loc}, unprecedented seasonal downpours and torrential river overflows have triggered one of the most severe humanitarian crises witnessed across northern India in recent years. Entire agrarian panchayats and riverside hamlets have been submerged beneath several feet of swift floodwaters, ruthlessly sweeping away traditional thatched mud dwellings, stored food grains, valuable cattle herds, and critical access roads. Tens of thousands of vulnerable individuals, including fragile newborn infants, expectant mothers, and disabled elderly residents, have been forced to flee their inundated homes in the dead of night, finding temporary refuge on narrow railway embankments, highway road shoulders, and flimsy tarpaulin shelters without access to clean drinking water, electricity, or basic hygienic sanitation. As muddy flood currents continue to drown local tubewells, boreholes, and open wells, families are exposed to hazardous contaminated runoffs, escalating the imminent threat of devastating waterborne epidemics like cholera, diarrhea, and dysentery across vulnerable relief encampments. Subsistence farmers and daily-wage laborers who already lived hand-to-mouth have lost their entire life savings and agricultural harvests in a matter of hours, leaving them completely destitute and fearful for their children’s future. In remote districts where rescue access remains exceptionally difficult, immediate grassroots humanitarian intervention is the singular lifeline preventing acute hunger, severe hypothermia, and preventable illness among isolated communities.`,
      img1: camp?.img || IMG.assam1,
      img1Tag: 'Immediate Crisis',
      img1Caption: `Submerged communities and isolated families awaiting emergency rescue across ${loc}`,
      p2: `In direct response to this humanitarian emergency, the SikhAid Rapid Response Taskforce mobilized within hours of the first distress alerts, establishing frontline command posts and continuous operational kitchens across accessible perimeter hubs. Navigating treacherous underwater obstructions and unpredictable currents, our trained volunteer units deployed motorized rescue dinghies and local wooden boats to evacuate marooned families from isolated house rooftops and cut-off hamlet islands. Simultaneously, our community langar teams established hygienic 24/7 field kitchens, preparing and packaging thousands of warm, protein-rich, nourishing meals every single morning and evening to ensure no child or parent goes to sleep hungry amidst the devastation. To counter the acute drinking water crisis, SikhAid logistics convoys transported thousands of sealed potable water cans, certified chlorine purification tablets, and high-volume reverse osmosis filtration units to frontline camps. Furthermore, our relief convoys are systematically handing over comprehensive dry ration survival packs filled with durable food staples, fortified pulses, flattened rice, matches, mosquito coils, solar flashlights, and durable waterproof tarpaulins that protect vulnerable families against relentless monsoon rainfall and night-time dampness. Every distribution drive is coordinated directly with community elders to ensure aid reaches the most marginalized households with total dignity, compassion, and zero administrative bottlenecks.`,
      img2: IMG.langar,
      img2Tag: 'Emergency Seva',
      img2Caption: 'Hot langar cooked 24/7 and delivered directly to displaced families in frontline relief camps',
      p3: `Beyond immediate life-saving rescue and daily nourishment, SikhAid is resolutely dedicated to standing shoulder-to-shoulder with affected communities through every stage of sustained post-disaster rehabilitation. As the floodwaters gradually recede, our engineers and ground coordinators will conduct thorough structural assessments to repair damaged village shelters, disinfect thousands of community drinking water wells, and restore damaged rural classrooms so children can safely resume their education. We will also distribute essential farming toolkits and high-yield seed reserves to help displaced rural families recover their livelihoods and rebuild their local economy with honor and self-reliance. Rooted in the timeless humanitarian ethos of Sarbat da Bhala—the unconditional service and welfare of all humankind—every single rupee you donate is deployed transparently on the frontlines with verified documentation, zero administrative middlemen, and real-time photographic accountability.`,
      img3: IMG.assam6,
      img3Tag: 'Rebuilding Lives',
      img3Caption: 'Distributing heavy-duty shelter kits, dry rations, and agricultural recovery supplies on the ground'
    };
  }

  if (t.includes('health') || t.includes('medical') || t.includes('spot') || t.includes('hygiene') || t.includes('oxygen')) {
    return {
      p1: `Across impoverished rural villages and remote interior settlements of ${loc}, access to dependable, quality medical care remains an unattainable luxury for millions of impoverished families, daily-wage laborers, and vulnerable elderly citizens. In these underserved pockets, government primary healthcare centers are frequently understaffed, depleted of vital life-saving medicines, or located dozens of kilometers away over broken, impassable roads. As a consequence, impoverished villagers suffering from chronic diseases such as uncontrolled diabetes, severe hypertension, respiratory infections, and debilitating cardiovascular disorders are forced to go without professional medical diagnostics or essential pharmaceutical prescriptions. For expectant mothers and fragile infants, the complete lack of preventive maternal healthcare and pediatric screenings leads to preventable complications, severe anemia, and chronic malnutrition. Impoverished families are often compelled to borrow catastrophic sums from predatory local moneylenders just to cover emergency transport and private hospital fees, sinking entire generations into lifelong indebtedness. Without regular preventive health monitoring and early medical intervention, common, manageable ailments quickly escalate into permanent disability or fatal emergencies, destroying family stability and deepening rural poverty across thousands of isolated households that possess zero alternative healthcare avenues.`,
      img1: camp?.img || IMG.health,
      img1Tag: 'Healthcare Need',
      img1Caption: `Remote doorstep clinical triage and diagnostic checkups across underserved districts of ${loc}`,
      p2: `To overcome these severe healthcare disparities and bring life-saving clinical support directly to underserved communities, SikhAid launched and operates dedicated mobile medical relief units and primary healthcare seva programs. Our specialized medical vans are equipped with advanced diagnostic equipment, portable ECG machines, digital vitals monitors, blood glucose analyzers, and comprehensive inventories of certified pharmaceutical medicines. Staffed by qualified volunteer doctors, registered nurses, and compassionate community health workers, our mobile clinics travel deep into remote hamlets to conduct free doorstep medical consultations, comprehensive diagnostic tests, and dispense necessary chronic medications. Beyond acute symptomatic treatment, our clinical teams prioritize preventive health education, conducting village-wide sessions on personal hygiene, safe drinking water handling, pediatric nutrition, and maternal healthcare management. For critical patients requiring specialized surgeries or secondary tertiary care, SikhAid coordinators facilitate emergency hospital transfers, cover diagnostic imaging costs, and provide patient navigation assistance. By bringing world-class, empathetic medical seva directly into forgotten rural backyards, SikhAid restores health, relieves chronic physical suffering, and protects struggling families from catastrophic medical impoverishment with unconditional love and respect.`,
      img2: IMG.hygiene,
      img2Tag: 'Mobile Clinics',
      img2Caption: 'Free doctor consultations, preventive health screenings, and essential prescription supplies on ground',
      p3: `SikhAid firmly believes that healthcare is a fundamental human right that must be delivered with unwavering dignity, cultural sensitivity, and complete financial transparency. We do not merely distribute temporary medicines; we establish enduring relationships of trust with the rural families we serve, creating digital patient health records to track long-term recovery and clinical outcomes. Guided by the revered Sikh humanitarian ethos of Sarbat da Bhala—welfare and healing for all humanity—our medical initiatives operate with 100% audited accountability and zero administrative overhead. Every diagnostic test administered, every antibiotic course dispensed, and every specialized treatment sponsored is meticulously verified and recorded with photographic evidence, guaranteeing that your philanthropic support directly saves vulnerable lives and nurtures lasting community wellness.`,
      img3: IMG.pads,
      img3Tag: 'Dignity Kits',
      img3Caption: 'Personal wellness and sanitary health dignity packs distributed to mothers and young women'
    };
  }

  // Hunger, Langar, Community & Education
  return {
    p1: `In the shadow of thriving urban centers and across drought-prone rural districts of ${loc}, the harsh reality of severe food insecurity and chronic hunger affects hundreds of thousands of underprivileged citizens every single day. For daily-wage laborers, migrant construction workers, widowed mothers, orphaned children, and destitute seniors living on the fringes of society, rising food inflation makes securing even one nutritious meal an agonizing daily ordeal. In informal settlements and transit corridors, families frequently consume low-quality, contaminated food scraps or are forced to skip meals entirely so their youngest children can have a morsel to eat before sleep. Chronic hunger deprives children of the essential vitamins, proteins, and micronutrients required for healthy brain development and immune defense, leaving them dangerously susceptible to stunting, recurrent infections, and chronic cognitive fatigue. For destitute elders and disabled individuals who lack social safety nets, hunger brings physical deterioration and painful isolation. In an age of unprecedented abundance, the tragedy of human beings going to bed on empty stomachs represents a profound crisis of human empathy and basic distributive justice that demands urgent, collective moral action from compassionate individuals everywhere.`,
    img1: camp?.img || IMG.food,
    img1Tag: 'Community Reality',
    img1Caption: `Daily hot nutritious meals served to struggling daily-wage laborers and families in ${loc}`,
    p2: `To combat this widespread hunger crisis and restore fundamental human dignity to every struggling individual, SikhAid operates vast community langar operations and comprehensive dry ration distribution networks across India. Rooted in the sacred 500-year-old tradition of Guru ka Langar—where wholesome meals are prepared and served to all people unconditionally, regardless of faith, caste, gender, or social background—our central kitchens prepare thousands of steaming, hygienically prepared meals every single day. Every hot meal features freshly made whole-wheat chapatis, protein-packed lentil dal, seasonal vegetables, and clean purified water, cooked with meticulous sanitation and boundless devotion by our tireless volunteers. In addition to daily hot meal distribution points outside major public hospitals, railway shelters, and impoverished bastis, our logistics convoys distribute heavy-duty monthly ration hampers to destitute households. These survival hampers contain 25 kilograms of essential whole grains, pulses, cooking oils, iodized salt, sugar, tea, and spices, guaranteeing continuous nutritional security for an entire family for 30 full days. Every distribution drive is conducted with profound humility and respect, ensuring recipients receive nourishment not as charity, but as their sacred right.`,
    img2: IMG.langar,
    img2Tag: 'Guru Ka Langar',
    img2Caption: 'Freshly prepared hot meals served with unconditional warmth, hygiene, and complete equality',
    p3: `SikhAid’s hunger relief mission is founded on the timeless philosophy that no human soul within reach of our community should ever suffer the agonizing indignity of starvation. We work tirelessly to eliminate the root logistical barriers that prevent wholesome food from reaching the most marginalized doorsteps, partnering with local community volunteers to identify homebound seniors, bedridden patients, and struggling widows who cannot travel to centralized langar halls. Guided by the enduring principle of Sarbat da Bhala—universal wellbeing and dignity for all creation—every single rupee you contribute is deployed directly to wholesale food procurement and frontline meal distribution with complete photographic audit trails, transparent financial accounts, and zero administrative waste.`,
    img3: IMG.ration,
    img3Tag: 'Monthly Kits',
    img3Caption: 'Comprehensive dry grocery ration hampers delivered directly to doorstep beneficiary families'
  };
}

// Updates format requested:
// Heading strictly: "Update - [Date]" (e.g. Update - 18 Oct)
// Latest is always first.
// Initially only 1 is visible, clicking "More Updates" reveals one more at a time.
export function getCampaignUpdates(camp) {
  if (camp?.updates?.length > 0) return camp.updates;
  const t = ((camp?.type || '') + ' ' + (camp?.group || '') + ' ' + (camp?.category || '') + ' ' + (camp?.title || '')).toLowerCase();

  if (t.includes('flood') || t.includes('disaster') || t.includes('emergency') || t.includes('landslide')) {
    return [
      {
        title: 'Update - 18 Oct',
        date: '18 Oct',
        desc: 'Over 5,000 hot langar meals, sealed drinking water filter kits, and emergency survival kits were distributed across 8 flooded villages along the river basin. Our mobile kitchen trucks are operating 24/7 at ground zero.',
        img: camp?.img || IMG.langar,
        verified: 'Verified Ground Deployment'
      },
      {
        title: 'Update - 12 Oct',
        date: '12 Oct',
        desc: 'Two heavy transport convoys carrying 1,200 dry ration packs, halogen water purification tablets, and heavy-duty waterproof tarpaulins crossed into cut-off sectors for direct volunteer handover.',
        img: IMG.assam3,
        verified: 'Logistics Disbursement Verified'
      },
      {
        title: 'Update - 05 Oct',
        date: '05 Oct',
        desc: 'Volunteer boat units deployed motorized dinghies and rafts across flooded tributaries, successfully evacuating 34 isolated families from submerged rooftops to elevated relief shelters.',
        img: IMG.assam1,
        verified: 'Evacuation Mission Verified'
      },
      {
        title: 'Update - 28 Sep',
        date: '28 Sep',
        desc: 'SikhAid Rapid Response Taskforce mobilized within 2 hours of emergency alerts. Frontline assessment units surveyed critical logistics bottlenecks and established frontline langar kitchens.',
        img: IMG.assam7,
        verified: 'Mission Launch Verified'
      }
    ];
  }

  if (t.includes('health') || t.includes('medical') || t.includes('spot') || t.includes('hygiene') || t.includes('oxygen')) {
    return [
      {
        title: 'Update - 18 Oct',
        date: '18 Oct',
        desc: 'Mobile Diagnostic Clinic van completed vital screenings and general physician consultations for 480 rural elders and children, dispensing free prescription medicines.',
        img: IMG.health || camp?.img,
        verified: 'Clinical Seva Verified'
      },
      {
        title: 'Update - 12 Oct',
        date: '12 Oct',
        desc: 'Certified medical first-aid kits, pediatric multi-vitamins, diagnostic monitors, and blood glucose supplies were replenished across 6 remote community health posts.',
        img: camp?.img || IMG.assam5,
        verified: 'Supply Audit Verified'
      },
      {
        title: 'Update - 05 Oct',
        date: '05 Oct',
        desc: 'Organized specialized maternal healthcare and anemia screening drive for 120 expectant mothers with distribution of iron-folic acid supplements and hygiene packs.',
        img: IMG.hygiene,
        verified: 'Maternal Care Verified'
      },
      {
        title: 'Update - 28 Sep',
        date: '28 Sep',
        desc: 'Mobile medical taskforce completed baseline health survey of 4 underserved hamlets, registering high-risk patients for recurring doorstep chronic disease management.',
        img: IMG.pads,
        verified: 'Community Triage Verified'
      }
    ];
  }

  return [
    {
      title: 'Update - 18 Oct',
      date: '18 Oct',
      desc: 'Daily Guru Ka Langar operations served over 3,200 warm, protein-packed nutritious meals to daily-wage workers, homeless families, and hospital attendees with dignity.',
      img: camp?.img || IMG.food,
      verified: 'Daily Seva Verified'
    },
    {
      title: 'Update - 12 Oct',
      date: '12 Oct',
      desc: 'Procurement milestone completed: 800 comprehensive monthly dry ration hampers containing grains, lentils, oil, and spices were packaged and distributed.',
      img: IMG.ration,
      verified: 'Procurement Verified'
    },
    {
      title: 'Update - 05 Oct',
      date: '05 Oct',
      desc: 'Specialized night food and warm blanket drive conducted across urban transit shelters, reaching 350 vulnerable seniors and children sleeping under open skies.',
      img: IMG.blanket,
      verified: 'Night Outreach Verified'
    },
    {
      title: 'Update - 28 Sep',
      date: '28 Sep',
      desc: 'Mobile Seva Van expanded distribution routes to cover three additional remote informal settlements, establishing scheduled weekly grocery drops.',
      img: IMG.fooddist,
      verified: 'Route Expansion Verified'
    }
  ];
}
