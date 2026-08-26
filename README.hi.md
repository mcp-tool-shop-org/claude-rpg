<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

# क्लाउड आरपीजी

एक सिमुलेशन-आधारित अभियान आरपीजी जहां क्लाउड कहानी प्रस्तुत करता है, इंजन सच्चाई को बनाए रखता है, और दुनिया अफवाहों, दबाव, गुटों, संबंधों, अर्थव्यवस्था और आर्क सिस्टम के माध्यम से सार्थक निष्कर्षों की ओर विकसित होती हैं। इसे खेलें या इस पर निर्माण करें।

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/claude-rpg/main/site/public/banner.jpg" width="800" alt="Ten glowing world-gates in a dark gallery — a lone traveler with a lantern chooses between them">
</p>

<p align="center"><em>Ten worlds. One narrator. The engine keeps the truth.</em></p>

## क्लाउड आरपीजी क्या है?

क्लाउड आरपीजी [एआई आरपीजी इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के शीर्ष पर स्थित है - एक नियतात्मक सिमुलेशन रनटाइम जिसमें 29 मॉड्यूल हैं जो युद्ध, अनुभूति, धारणा, गुटों, अफवाहों, विश्वास की उत्पत्ति, एनपीसी एजेंसी, साथियों, खिलाड़ी लाभ, रणनीतिक मानचित्र, आइटम पहचान, उपकरण की उत्पत्ति, उभरते अवसर, अभियान आर्क का पता लगाने और अंतिम खेल ट्रिगर्स को कवर करते हैं। क्लाउड का काम व्याख्या करना, वर्णन करना और बोलना है। इंजन का काम सच्चाई को बनाए रखना है।

सुनहरा नियम: **क्लाउड प्रस्ताव रखता है, इंजन निपटान करता है।**

खिलाड़ी मुक्त-स्वरूप पाठ टाइप करते हैं। क्लाउड इरादे की व्याख्या करता है, इंजन कार्यों को नियतात्मक रूप से हल करता है, धारणा फिल्टर यह तय करते हैं कि खिलाड़ी ने वास्तव में क्या देखा, और फिर क्लाउड केवल वही वर्णन करता है जो चरित्र ने अनुभव किया - आवाज, ध्वनि प्रभाव और इमर्शन रनटाइम द्वारा प्रस्तुत परिवेशीय ऑडियो के साथ।

एनपीसी स्क्रिप्ट का पाठ नहीं करते हैं। वे विश्वासों, यादों, गुट निष्ठा और अफवाहों से बोलते हैं। वे कारणों से झूठ बोलते हैं। वे कारणों से अनिश्चित होते हैं। वे कारणों से इनकार करते हैं। निर्देशक मोड आपको ठीक से निरीक्षण करने देता है कि क्यों।

## अपना खुद का निर्माण करें

क्लाउड आरपीजी सिर्फ एक गेम नहीं है - यह एआई आरपीजी इंजन पारिस्थितिकी तंत्र के लिए एक संदर्भ कार्यान्वयन है। इसे अपने स्वयं के सिमुलेशन-आधारित कथा अनुभवों के लिए शुरुआती बिंदु के रूप में उपयोग करें।

| क्या आप... | उपयोग करना चाहते हैं |
|------------|-----|
| **Play right now** | `npx claude-rpg play` (इंटरैक्टिव दुनिया और चरित्र चयन) |
| **Create a new world** | `npx claude-rpg new "your world concept"` |
| **Author worlds visually** | [वर्ल्ड फोर्ज](https://github.com/mcp-tool-shop-org/world-forge) - 2डी ऑथरिंग स्टूडियो जिसमें मानचित्र संपादक, एनपीसी बिल्डर और सत्यापन शामिल है। |
| **Validate world data** | [कैनन आर्काइव](https://github.com/mcp-tool-shop-org/cannon-archive) - स्कीमा सत्यापन, स्टोरीबोर्ड परीक्षण, निर्यात पाइपलाइन। |
| **Build a custom runtime** | [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) पैकेज सीधे आयात करें - क्लाउड को किसी भी एलएलएम से बदलें, अपना स्वयं का यूआई जोड़ें। |
| **Add new game modules** | इंजन को फोर्क करें, समाधान पाइपलाइन में मॉड्यूल जोड़ें और उन्हें पंजीकृत करें। |

इंजन एलएलएम-अज्ञेयवादी है। क्लाउड आरपीजी एंथ्रोपिक मॉडल का उपयोग करता है, लेकिन मुख्य इंजन में शून्य एलएलएम निर्भरताएं हैं - आप इसे किसी भी मॉडल से जोड़ सकते हैं या पूरी तरह से नियतात्मक रूप से बिना वर्णन के चला सकते हैं।

## स्थापित करें

```bash
npm install claude-rpg
```

या सीधे चलाएं:

```bash
npx claude-rpg play
```

## त्वरित शुरुआत

```bash
# Play — interactive world and character selection (ten worlds, grouped by difficulty)
npx claude-rpg play

# Jump straight into a named world
npx claude-rpg play --world gladiator

# Accelerated campaign pacing
npx claude-rpg play --fast

# Generate a new world from a prompt
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"

# Use the engine in your own project
npm install @ai-rpg-engine/core @ai-rpg-engine/modules
```

अपना एंथ्रोपिक एपीआई कुंजी सेट करें (केवल क्लाउड वर्णन के लिए आवश्यक):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## v1.6.0 में नया क्या है

v1.6 दस-दुनिया की सूची को वास्तविक बनाता है, हार को वास्तविक महत्व देता है, और जब नेटवर्क उपलब्ध नहीं होता है तो कथाकार को लचीला बनाता है।

| सुविधा | इसका क्या मतलब है |
|---------|--------------|
| **Ten playable worlds** | आयरन कोलोसियम (ग्लैडिएटर), जेड वेल (रोनीन) और क्रिमसन कोर्ट (वैम्पायर) सूची में शामिल होते हैं - दस दुनिया, चयनकर्ता में कठिनाई के अनुसार समूहीकृत। |
| **`--world` ध्वज** | `npx claude-rpg play --world gladiator` सीधे एक नामित दुनिया में मेनू को छोड़ देता है। दस उपनाम, सभी `--help` में सूचीबद्ध हैं। |
| **Death is a setback** | युद्ध में गिरने से एक विशिष्ट मृत्यु स्क्रीन पर फीका पड़ जाता है और जब तक आप नहीं उठते तब तक आपकी क्रियाएं सीमित हो जाती हैं - अभियान जानबूझकर `/conclude` के माध्यम से समाप्त होते हैं, कभी भी किसी खराब लड़ाई से नहीं। |
| **Streaming narration** | गद्य इस रूप में प्रस्तुत किया जाता है जैसे कथाकार इसे लिखता है, बाद में नहीं। |
| **मांग पर `/cost`** | सत्र टोकन उपयोग और अनुमानित व्यय, बिना कुछ खर्च किए पूछें। |
| **एक स्पिनर जो सच बताता है** | एपीआई पुनः प्रयास के दौरान, सोचने वाला स्पिनर प्रयास और कारण की रिपोर्ट करता है - "अभी भी सोच रहा है (पुनः प्रयास 1/2 - दर सीमा तक पहुंच गया)।" निरंतर आउटेज फॉलबैक गद्य को एक ईमानदार "यह अभी भी हो रहा है" में बदल देते हैं। |
| **Ambient world chatter** | पृष्ठभूमि एनपीसी अपने जीवन के बारे में बताते हैं - एक व्यापारी कीमतों की जांच कर रहा है, एक गार्ड भीड़ को स्कैन कर रहा है - प्रत्येक दुनिया के अनुसार स्वाद दिया गया, शून्य एपीआई लागत पर। |
| **एनपीसी याद रखते हैं, यहां तक कि सहेजने के बीच भी** | अब बातचीत की स्मृति सहेज/लोड के माध्यम से बनी रहती है: आपने गार्ड को दो सत्र पहले जो बताया था, वह अभी भी वे क्या कहते हैं, उसे प्रभावित करता है। |
| **Names, not slugs** | स्थिति पट्टी, सारांश और सहेजने वाली सूचियां "पेंटिटेंट नाइट" दिखाती हैं, कभी नहीं `penitent-knight`। ध्वनि संकेत शब्दों के रूप में पढ़े जाते हैं, कभी नहीं `white_noise`। |
| **1,542 परीक्षण** | 95 फ़ाइलों में 625 से बढ़कर, प्रति-पथ कवरेज फर्श को सीआई में लागू किया गया है। |

## यह अलग क्यों है

| क्या | कैसे |
|------|-----|
| **सिमुलेशन सत्य वर्णन से अलग** | इंजन युद्ध, आंदोलन, संवाद को हल करता है - क्लाउड केवल परिणाम का वर्णन करता है। कोई भी भ्रमित परिणाम नहीं। |
| **संज्ञान में निहित एनपीसी संवाद** | एनपीसी भाषण की प्रत्येक पंक्ति उनके विश्वासों, यादों, मनोबल, संदेह, गुट और अफवाहों से बनाई जाती है। |
| **धारणा-जागरूक प्रस्तुति** | क्लाउड को केवल वही प्राप्त होता है जो खिलाड़ी चरित्र ने अनुभव किया था। कम-स्पष्ट संस्थाएं छायादार आकृतियों के रूप में दिखाई देती हैं, न कि नामित लक्ष्यों के रूप में। |
| **ऑडियो/वॉइस इमर्शन रनटाइम** | संरचित कथा योजनाएं आवाज संश्लेषण, ध्वनि प्रभाव, परिवेशीय परतें और संगीत को वॉयस-साउंडबोर्ड के माध्यम से चलाती हैं। |
| **छिपे हुए सत्य में निर्देशक दृश्यता** | `/inspect pilgrim` विश्वास दिखाता है। `/trace` उत्पत्ति दिखाता है। `/divergences` दिखाता है कि आपने क्या सोचा था कि हुआ बनाम वास्तव में क्या हुआ। |
| **परिणाम श्रृंखलाओं के साथ एनपीसी एजेंसी** | एनपीसी लक्ष्यों पर कार्य करते हैं, दायित्वों को ट्रैक करते हैं और जब निष्ठा ब्रेकपॉइंट शिफ्ट होते हैं तो प्रतिशोध करते हैं। `/npc` और `/people` ब्रेकपॉइंट, लाभ कोण और सक्रिय परिणाम श्रृंखलाओं को उजागर करते हैं। |
| **Living districts** | ज़िलों में वाणिज्य, मनोबल और सुरक्षा होती है जो खिलाड़ी की कार्रवाइयों, गुटों के आंदोलनों और एनपीसी परिणामों की श्रृंखलाओं से बदलती रहती हैं। मूड कथा में प्रवाहित होता है और गेमप्ले को बढ़ाता है। `/districts` और `/district` पड़ोस की स्थिति का निरीक्षण करते हैं। |
| **प्रस्थान जोखिम वाले साथी** | पार्टी के सदस्यों में मनोबल, वफादारी और प्रस्थान ट्रिगर होते हैं। उन्हें बहुत अधिक दबाएं और वे चले जाएंगे - उन कारणों से जिनकी जानकारी इंजन रखता है। |
| **खिलाड़ी का प्रभाव और राजनीतिक कार्रवाई** | सामाजिक, अफवाह, कूटनीति और तोड़फोड़ की कार्रवाइयों पर प्रभाव, एहसान और खुफिया जानकारी खर्च करें। `/leverage` आपकी राजनीतिक पूंजी दिखाता है। |
| **उपकरण की उत्पत्ति और अवशेष** | वस्तुओं में इतिहास होता है। एक तलवार जो पर्याप्त संख्या में लोगों को मारती है, वह एक उपाधि के साथ एक अवशेष बन जाती है। एनपीसी उपकरण वाली वस्तुओं को पहचानते हैं और प्रतिक्रिया करते हैं। `/item` उत्पत्ति का निरीक्षण करता है और कालक्रम बनाता है। |
| **Emergent opportunities** | अनुबंध, इनाम, एहसान, आपूर्ति अभियान और जांच दुनिया की स्थितियों से उत्पन्न होते हैं - दबाव, कमी, एनपीसी लक्ष्य, दायित्व। स्वीकार करें, अस्वीकार करें, छोड़ दें या धोखा दें। `/jobs` और `/accepted` उपलब्ध और सक्रिय कार्यों को ट्रैक करते हैं। |
| **अभियान आर्क और अंतिम खेल** | इंजन संचित स्थिति से 10 कथात्मक आर्क प्रकार (शक्ति का उदय, शिकार किया गया, राजा निर्माता, प्रतिरोध, आदि) और 8 अंतिम-खेल समाधान वर्ग (विजय, निर्वासन, उखाड़ फेंकना, शहीद होना, आदि) का पता लगाता है। `/arcs` प्रक्षेपवक्र दिखाता है। `/conclude` वैकल्पिक एलएलएम कथा के साथ एक संरचित उपसंहार प्रस्तुत करता है। |

## आर्किटेक्चर

```
Player types freeform text
    |
[1] ACTION INTERPRETATION (Claude)
    Input: player text + verbs + entities + exits
    Output: { verb, targetIds, confidence }
    |
[2] ENGINE RESOLUTION (deterministic)
    engine.submitAction() -> ResolvedEvent[]
    |
[3] PERCEPTION FILTERING (deterministic)
    presentForObserver() -> what the player saw
    |
[4] HOOKS: pre-narration
    Zone ambient, combat alerts, death effects
    |
[5] NARRATION PLAN (Claude)
    Input: filtered scene + presentation state
    Output: NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] AUDIO DIRECTOR
    Priority, ducking, cooldowns -> AudioCommand[]
    |
[7] PRESENTATION
    Voice synthesis + SFX + ambient via voice-soundboard
    Text rendering to terminal
    |
[8] NPC DIALOGUE (Claude, if speaking)
    Grounded in cognition: beliefs, memories, faction, rumors
    Voice-cast per NPC
```

## इमर्सिव रनटाइम (v0.2)

कथाकार कच्चा गद्य आउटपुट नहीं करता है - यह एक **कथा योजना** तैयार करता है: एक संरचित नुस्खा जो पाठ, ध्वनि प्रभाव, परिवेश परतें, संगीत संकेत और आवाज मापदंडों का वर्णन करता है।

| मॉड्यूल | उद्देश्य |
|--------|---------|
| **प्रस्तुति राज्य मशीन** | अन्वेषण / संवाद / युद्ध / परिणाम को ट्रैक करता है - ऑडियो परत चयन चलाता है |
| **Hook Lifecycle** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking` — संदर्भ-जागरूक ऑडियो इंजेक्ट करें |
| **Voice Caster** | प्रकार, लिंग और गुट के आधार पर एनपीसी को [वॉइस-साउंडबोर्ड](https://github.com/mcp-tool-shop-org/original_voice-soundboard) आवाजों में ऑटो-मैप करता है |
| **Audio Director** | प्राथमिकता, डकिंग, कूलडाउन और एंटी-स्पैम के साथ संकेतों का समय निर्धारित करता है |
| **Sound Registry** | सामग्री-आधारित ऑडियो प्रविष्टियाँ - टैग, मूड, तीव्रता द्वारा क्वेरी करें |
| **MCP Bridge** | ऑडियो कमांड को वॉइस-साउंडबोर्ड टूल कॉल में अनुवाद करता है |

## तीन मोड

| मोड | यह क्या करता है |
|------|-------------|
| **Play** | इमर्सिव कथात्मक आरपीजी। क्लाउड वर्णन करता है, एनपीसी अपनी मान्यताओं से बोलते हैं, क्रियाएं इंजन के माध्यम से हल होती हैं। |
| **Director** | छिपे हुए सत्य का निरीक्षण करें: `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | घटना समयरेखा पर चलें जो उद्देश्यपूर्ण सत्य बनाम खिलाड़ी की धारणा को एक साथ दिखाती है। |

## पारिस्थितिकी तंत्र

क्लाउड आरपीजी सिमुलेशन-आधारित कथात्मक गेम बनाने के लिए एक बड़े टूलचेन का एक हिस्सा है:

| परियोजना | यह क्या करता है |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | निर्धारक सिमुलेशन रनटाइम - 29 मॉड्यूल, शून्य एलएलएम निर्भरताएँ |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | 2डी दुनिया ऑथरिंग स्टूडियो - मानचित्र संपादक, एनपीसी बिल्डर, रेंडरर, निर्यात |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | स्कीमा सत्यापन, स्टोरीबोर्ड परीक्षण, एआई आरपीजी निर्यात पाइपलाइन |
| **Claude RPG** (this repo) | संदर्भ रनटाइम - क्लाउड कथा, इमर्सिव ऑडियो, निर्देशक उपकरण |

## इंजन पैकेज

क्लाउड आरपीजी निम्नलिखित [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) पैकेजों पर निर्भर करता है:

| पैकेज | उद्देश्य |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | राज्य, संस्थाएँ, क्रियाएँ, घटनाएँ, नियम, आरएनजी |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 मॉड्यूल - युद्ध, अनुभूति, धारणा, गुट, अफवाहें, एनपीसी एजेंसी, साथी, प्रभाव, रणनीतिक मानचित्र, आइटम मान्यता, उभरते अवसर |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | चरित्र प्रगति, चोटें, प्रतिष्ठा |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | उपकरण, आइटम उत्पत्ति, अवशेष वृद्धि, कालक्रम |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | क्रॉस-सत्र स्मृति, संबंध प्रभाव |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | कथा योजना स्कीमा, रेंडर अनुबंध |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | ऑडियो क्यू शेड्यूलिंग, प्राथमिकता, डकिंग |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | साउंड पैक रजिस्ट्री + कोर पैक |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | विश्व सामग्री सत्यापन |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | चैपल थ्रेसहोल्ड स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | नियॉन लॉकबॉक्स स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | गैसलाइट डिटेक्टिव स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | ब्लैक फ्लैग रेक्विम स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | एशफॉल डेड स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | डस्ट डेविल का सौदा स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | सिग्नल लॉस स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | आयरन कोलोसियम स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | जेड वेइल स्टार्टर दुनिया |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | क्रिमसन कोर्ट स्टार्टर दुनिया |

## रनटाइम गारंटी (v1.6.0)

| गारंटी | प्रवर्तन |
|-----------|------------|
| **इंजन कथा से पहले हल करता है** | 15 निर्धारक परीक्षणों के साथ टर्न-लूप एकीकरण हार्नेस |
| **सहेजें फ़ाइलें संस्करण बहाव से बच जाती हैं** | क्रमबद्ध प्रवासन पाइपलाइन, ऐतिहासिक फिक्स्चर परीक्षण, .bak रिकवरी के साथ परमाणु लेखन |
| **क्लाउड विफलताओं से खिलाड़ी-सुरक्षित संदेश बनते हैं** | टाइप किया गया `NarrationError` एडाप्टर जिसमें 9 त्रुटि-पथ परीक्षण हैं, `--debug` नैदानिक ​​के लिए ध्वज |
| **स्ट्रीमिंग स्थिति को दूषित नहीं कर सकती है** | मानक स्थिति को स्ट्रीम किए गए पाठ से पहले अंतिम रूप दिया जाता है; 6 स्ट्रीमिंग-विशिष्ट परीक्षण |
| महत्वपूर्ण रास्तों पर कवरेज फर्श | सीआई सत्र, कथाकार, टर्न-लूप और एलएलएम एडाप्टर पर प्रति-मॉड्यूल थ्रेसहोल्ड लागू करता है |

## टोकन बजट

| चरण | इनपुट | आउटपुट |
|------|-------|--------|
| कार्रवाई व्याख्या | ~800 टोकन | ~100 टोकन |
| दृश्य कथा (कथा योजना) | ~1400 टोकन | ~300 टोकन |
| एनपीसी संवाद | ~1400 टोकन | ~100 टोकन |
| **Total per turn** | **~3600 टोकन** | **~500 टोकन** |

डिफ़ॉल्ट मॉडल: `claude-sonnet-4-20250514`। विश्व पीढ़ी गुणवत्ता के लिए ओपस का उपयोग करती है।

## सुरक्षा

क्लॉड आरपीजी एक स्थानीय सीएलआई एप्लिकेशन है जो एंथ्रोपिक के लिए आउटबाउंड एपीआई कॉल करता है।

- **उपयोग की गई डेटा:** `~/.claude-rpg/saves/` में खिलाड़ी की सेव फाइलें, एंथ्रोपिक एपीआई (केवल आउटबाउंड एचटीटीपीएस)
- **उपयोग नहीं किया गया डेटा:** कोई टेलीमेट्री नहीं, कोई एनालिटिक्स नहीं, सेव निर्देशिका के बाहर कोई फ़ाइल सिस्टम नहीं
- **एपीआई कुंजी:** `ANTHROPIC_API_KEY` पर्यावरण चर से पढ़ी जाती है — इसे कभी भी संग्रहीत, लॉग या एंथ्रोपिक एपीआई से आगे प्रसारित नहीं किया जाता है।
- **स्रोत कोड में कोई गुप्त जानकारी नहीं** — कोई अंतर्निहित टोकन, क्रेडेंशियल या एपीआई कुंजियाँ नहीं।

पूर्ण सुरक्षा नीति और भेद्यता रिपोर्टिंग के लिए [SECURITY.md](SECURITY.md) देखें।

## लाइसेंस

एमआईटी

---

[एमसीपी टूल शॉप](https://mcp-tool-shop.github.io/) द्वारा निर्मित।
