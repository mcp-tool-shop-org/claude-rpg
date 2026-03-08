<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/claude-rpg/readme.png" width="500" alt="Claude RPG">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/claude-rpg"><img src="https://img.shields.io/npm/v/claude-rpg.svg" alt="npm version"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg"><img src="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/claude-rpg/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Claude RPG

एक सिमुलेशन-आधारित टर्मिनल RPG जहाँ Claude कथा सुनाता है, इंजन सत्य की रक्षा करता है, और इमर्शन रनटाइम आवाज़, ध्वनि और प्रस्तुति का संचालन करता है।

## Claude RPG क्या है?

Claude RPG [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के ऊपर बना है — एक नियतात्मक सिमुलेशन रनटाइम जिसमें 29 मॉड्यूल हैं जो युद्ध, संज्ञान, धारणा, गुट, अफ़वाहें, विश्वास उत्पत्ति, NPC स्वायत्तता, साथी, खिलाड़ी प्रभाव, रणनीतिक नक्शे, वस्तु पहचान, उपकरण उत्पत्ति, उभरते अवसर, अभियान चाप पहचान, और अंतिम चरण ट्रिगर को कवर करते हैं। Claude का काम है व्याख्या करना, कथा सुनाना और बोलना। इंजन का काम है सत्य का स्वामित्व रखना।

सुनहरा नियम: **Claude प्रस्ताव करता है, इंजन निर्णय लेता है।**

खिलाड़ी स्वतंत्र पाठ टाइप करते हैं। Claude इरादे की व्याख्या करता है, इंजन क्रियाओं को नियतात्मक रूप से हल करता है, धारणा फ़िल्टर तय करते हैं कि खिलाड़ी ने वास्तव में क्या देखा, और फिर Claude केवल वही बताता है जो पात्र ने अनुभव किया — आवाज़, ध्वनि प्रभावों और परिवेश ऑडियो के साथ जिन्हें इमर्शन रनटाइम संचालित करता है।

NPC पटकथा नहीं पढ़ते। वे विश्वासों, स्मृतियों, गुट निष्ठा और अफ़वाहों से बोलते हैं। वे कारणों से झूठ बोलते हैं। वे कारणों से अनिश्चित होते हैं। वे कारणों से मना करते हैं। डायरेक्टर मोड आपको ठीक-ठीक दिखाता है कि क्यों।

## इंस्टॉल करें

```bash
npm install claude-rpg
```

या सीधे चलाएँ:

```bash
npx claude-rpg play --world fantasy
```

## त्वरित शुरुआत

```bash
# बिल्ट-इन Chapel Threshold परिदृश्य खेलें
npx claude-rpg play --world fantasy

# एक प्रॉम्प्ट से नई दुनिया बनाएँ
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"
```

अपनी Anthropic API कुंजी सेट करें:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## यह अलग क्यों है

| क्या | कैसे |
|------|------|
| **सिमुलेशन सत्य कथा से अलग** | इंजन युद्ध, गतिविधि, संवाद हल करता है — Claude केवल परिणाम की कथा सुनाता है। कोई मनगढ़ंत परिणाम नहीं। |
| **NPC संवाद संज्ञान पर आधारित** | NPC की हर पंक्ति उनके विश्वासों, स्मृतियों, मनोबल, संदेह, गुट और अफ़वाहों से बनी होती है। |
| **धारणा-जागरूक प्रस्तुति** | Claude को केवल वही मिलता है जो खिलाड़ी पात्र ने अनुभव किया। कम स्पष्टता वाली इकाइयाँ छायादार आकृतियों के रूप में दिखती हैं, नामित लक्ष्यों के रूप में नहीं। |
| **ऑडियो/आवाज़ इमर्शन रनटाइम** | संरचित कथा योजनाएँ voice-soundboard के माध्यम से आवाज़ संश्लेषण, ध्वनि प्रभाव, परिवेश परतें और संगीत को संचालित करती हैं। |
| **छिपे सत्य में डायरेक्टर दृश्यता** | `/inspect pilgrim` विश्वास दिखाता है। `/trace` उत्पत्ति दिखाता है। `/divergences` दिखाता है कि आपने क्या सोचा बनाम वास्तव में क्या हुआ। |
| **परिणाम श्रृंखलाओं के साथ NPC स्वायत्तता** | NPC लक्ष्यों पर कार्य करते हैं, दायित्वों को ट्रैक करते हैं, और निष्ठा विराम बिंदुओं पर प्रतिशोध लेते हैं। `/npc` और `/people` विराम बिंदु, प्रभाव कोण और सक्रिय परिणाम श्रृंखलाएँ दिखाते हैं। |
| **जीवंत जिले** | जिलों में वाणिज्य, मनोबल और सुरक्षा होती है जो खिलाड़ी क्रियाओं, गुट चालों और NPC परिणाम श्रृंखलाओं से बदलती है। मूड कथा में प्रवाहित होता है और गेमप्ले को प्रभावित करता है। `/districts` और `/district` पड़ोस की नब्ज़ दिखाते हैं। |
| **प्रस्थान जोखिम वाले साथी** | दल के सदस्यों में मनोबल, निष्ठा और प्रस्थान ट्रिगर होते हैं। उन्हें बहुत दबाएँ और वे चले जाएँगे — उन कारणों से जो इंजन ट्रैक करता है। |
| **खिलाड़ी प्रभाव और राजनीतिक कार्रवाई** | सामाजिक, अफ़वाह, कूटनीति और तोड़फोड़ क्रियाओं पर प्रभाव, एहसान और खुफिया जानकारी खर्च करें। `/leverage` आपकी राजनीतिक पूँजी दिखाता है। |
| **उपकरण उत्पत्ति और अवशेष** | वस्तुएँ इतिहास रखती हैं। पर्याप्त हत्या करने वाली तलवार उपनाम के साथ अवशेष बन जाती है। NPC सुसज्जित वस्तुओं को पहचानते हैं और प्रतिक्रिया देते हैं। `/item` उत्पत्ति और इतिवृत्त दिखाता है। |
| **उभरते अवसर** | अनुबंध, इनाम, एहसान, आपूर्ति अभियान और जाँच विश्व स्थितियों से उत्पन्न होते हैं — दबाव, कमी, NPC लक्ष्य, दायित्व। स्वीकार करें, अस्वीकार करें, छोड़ दें या धोखा दें। `/jobs` और `/accepted` उपलब्ध और सक्रिय कार्यों को ट्रैक करते हैं। |
| **अभियान चाप और अंतिम चरण** | इंजन संचित अवस्था से 10 कथा चाप प्रकारों (rising-power, hunted, kingmaker, resistance, आदि) और 8 अंतिम समाधान वर्गों (victory, exile, overthrow, martyrdom, आदि) का पता लगाता है। `/arcs` प्रक्षेपवक्र दिखाता है। `/conclude` वैकल्पिक LLM कथा के साथ एक संरचित उपसंहार प्रस्तुत करता है। |

## वास्तुकला

```
खिलाड़ी स्वतंत्र पाठ टाइप करता है
    |
[1] क्रिया व्याख्या (Claude)
    इनपुट: खिलाड़ी पाठ + क्रियाएँ + इकाइयाँ + निकास
    आउटपुट: { verb, targetIds, confidence }
    |
[2] इंजन समाधान (नियतात्मक)
    engine.submitAction() -> ResolvedEvent[]
    |
[3] धारणा फ़िल्टरिंग (नियतात्मक)
    presentForObserver() -> खिलाड़ी ने क्या देखा
    |
[4] हुक्स: कथा-पूर्व
    क्षेत्र परिवेश, युद्ध अलर्ट, मृत्यु प्रभाव
    |
[5] कथा योजना (Claude)
    इनपुट: फ़िल्टर किया गया दृश्य + प्रस्तुति स्थिति
    आउटपुट: NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] ऑडियो डायरेक्टर
    प्राथमिकता, डकिंग, कूलडाउन -> AudioCommand[]
    |
[7] प्रस्तुति
    Voice synthesis + SFX + ambient — voice-soundboard के माध्यम से
    टर्मिनल पर टेक्स्ट रेंडरिंग
    |
[8] NPC संवाद (Claude, यदि बोल रहा हो)
    संज्ञान पर आधारित: विश्वास, स्मृतियाँ, गुट, अफ़वाहें
    प्रति NPC वॉइस-कास्ट
```

## इमर्शन रनटाइम (v0.2)

कथावाचक कच्चा गद्य नहीं देता — वह एक **NarrationPlan** तैयार करता है: एक संरचित विधि जो पाठ, ध्वनि प्रभाव, परिवेश परतें, संगीत संकेत और आवाज़ पैरामीटर का वर्णन करती है।

| मॉड्यूल | उद्देश्य |
|---------|----------|
| **Presentation State Machine** | exploration / dialogue / combat / aftermath को ट्रैक करता है — ऑडियो परत चयन को संचालित करता है |
| **Hook Lifecycle** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking` — संदर्भ-जागरूक ऑडियो इंजेक्ट करता है |
| **Voice Caster** | NPC को प्रकार, लिंग, गुट के अनुसार [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) आवाज़ों से स्वतः मैप करता है |
| **Audio Director** | प्राथमिकता, डकिंग, कूलडाउन, एंटी-स्पैम के साथ संकेतों को शेड्यूल करता है |
| **Sound Registry** | सामग्री-संबोधनीय ऑडियो प्रविष्टियाँ — टैग, मूड, तीव्रता द्वारा खोजें |
| **MCP Bridge** | AudioCommands को voice-soundboard टूल कॉल में अनुवाद करता है |

## तीन मोड

| मोड | यह क्या करता है |
|------|-----------------|
| **Play** | इमर्सिव कथात्मक RPG। Claude कथा सुनाता है, NPC विश्वासों से बोलते हैं, क्रियाएँ इंजन के माध्यम से हल होती हैं। |
| **Director** | छिपे सत्य का निरीक्षण करें: `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | उद्देश्य सत्य बनाम खिलाड़ी धारणा को साथ-साथ दिखाते हुए घटना समयरेखा पर चलें। |

## इंजन पैकेज

Claude RPG इन [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) पैकेजों पर निर्भर है:

| पैकेज | उद्देश्य |
|--------|----------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | स्थिति, इकाइयाँ, क्रियाएँ, घटनाएँ, नियम, RNG |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 मॉड्यूल — युद्ध, संज्ञान, धारणा, गुट, अफ़वाहें, NPC स्वायत्तता, साथी, प्रभाव, रणनीतिक नक्शा, वस्तु पहचान, उभरते अवसर |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | पात्र प्रगति, चोटें, प्रतिष्ठा |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | उपकरण, वस्तु उत्पत्ति, अवशेष विकास, इतिवृत्त |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | क्रॉस-सत्र स्मृति, संबंध प्रभाव |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | NarrationPlan स्कीमा, रेंडर अनुबंध |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | ऑडियो संकेत शेड्यूलिंग, प्राथमिकता, डकिंग |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | साउंड पैक रजिस्ट्री + कोर पैक |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | विश्व सामग्री सत्यापन |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Threshold स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon Lockbox स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Gaslight Detective स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Black Flag Requiem स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Ashfall Dead स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Dust Devil's Bargain स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Signal Loss स्टार्टर दुनिया |

## टोकन बजट

| चरण | इनपुट | आउटपुट |
|------|-------|---------|
| क्रिया व्याख्या | ~800 टोकन | ~100 टोकन |
| दृश्य कथन (NarrationPlan) | ~1400 टोकन | ~300 टोकन |
| NPC संवाद | ~1400 टोकन | ~100 टोकन |
| **कुल प्रति बारी** | **~3600 टोकन** | **~500 टोकन** |

डिफ़ॉल्ट मॉडल: `claude-sonnet-4-20250514`। दुनिया निर्माण गुणवत्ता के लिए Opus का उपयोग करता है।

## सुरक्षा

Claude RPG एक स्थानीय CLI एप्लिकेशन है जो Anthropic को आउटबाउंड API कॉल करता है।

- **डेटा जो उपयोग होता है:** `~/.claude-rpg/saves/` में खिलाड़ी सेव फ़ाइलें, Anthropic API (केवल आउटबाउंड HTTPS)
- **डेटा जो उपयोग नहीं होता:** कोई टेलीमेट्री नहीं, कोई एनालिटिक्स नहीं, सेव डायरेक्टरी के बाहर कोई फ़ाइलसिस्टम एक्सेस नहीं
- **API कुंजी:** `ANTHROPIC_API_KEY` एनवायरनमेंट वेरिएबल से पढ़ी जाती है — कभी संग्रहीत, लॉग या Anthropic API के अलावा कहीं प्रेषित नहीं होती
- **स्रोत में कोई गोपनीय जानकारी नहीं** — कोई एम्बेडेड टोकन, क्रेडेंशियल या API कुंजी नहीं

पूर्ण सुरक्षा नीति और भेद्यता रिपोर्टिंग के लिए [SECURITY.md](SECURITY.md) देखें।

## लाइसेंस

MIT

---

[MCP Tool Shop](https://mcp-tool-shop.github.io/) द्वारा निर्मित
