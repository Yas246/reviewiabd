// ============================================
// SCRIPT DE TEST: JSON NORMAL vs JSON COMPACT
// ============================================
// Objectif: Comparer la génération de questions en JSON normal vs JSON compact
// pour mesurer les économies de tokens et l'augmentation possible du batch size
//
// Usage:
// - Changer QUESTION_COUNT pour tester différents nombres de questions
// - Changer API_KEY avec votre clé OpenRouter
// - Node.js requis: node test-json-compact.js
// ============================================

// ============================================
// CONFIGURATION - MODIFIEZ CES VALEURS
// ============================================

const API_KEY =
  "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"; // Mettez votre clé OpenRouter ici
const QUESTION_COUNT = 40; // Nombre de questions à générer (facilement changeable)
const DOMAIN = "MACHINE_LEARNING";
const MODEL = "z-ai/glm-4.5-air:free"; // Modèle par défaut
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // ms

// ============================================
// PROMPTS
// ============================================

const DOMAIN_PROMPTS = {
  MACHINE_LEARNING:
    "Machine Learning Fondamental: algorithmes supervisés, non supervisés, régression, classification, clustering, evaluation de modèles, biais/variance, overfitting/underfitting.",
};

// Prompt actuel avec JSON normal
function generatePromptNormal(count) {
  return `Tu es un expert pédagogique en Intelligence Artificielle et Big Data. Génère ${count} questions à choix multiple (QCM) sur le domaine suivant:

${DOMAIN_PROMPTS[DOMAIN]}
IMPORTANT: Tu dois répondre UNIQUEMENT avec un tableau JSON valide contenant les questions. Pas de texte avant ou après le JSON.

Format attendu pour chaque question:
{
  "question": "texte de la question",
  "answers": [
    {"text": "réponse A", "isCorrect": false},
    {"text": "réponse B", "isCorrect": true},
    {"text": "réponse C", "isCorrect": false},
    {"text": "réponse D", "isCorrect": false}
  ],
  "explanation": "explication détaillée de la bonne réponse"
}

Contraintes:
- Les questions doivent être techniques et précises
- Une seule bonne réponse par question
- 4 choix de réponse par question
- L'explication doit être concise (2-3 phrases maximum)
- Les questions doivent couvrir différents aspects du domaine
- Inclure des questions pratiques et théoriques

IMPORTANT: Assure-toi que le JSON est complet et bien formé. Ne coupe pas ta réponse.

Génère maintenant les ${count} questions au format JSON tableau:`;
}

// Prompt avec JSON compact
function generatePromptCompact(count) {
  return `Tu es un expert pédagogique en IA. Génère ${count} QCM sur: ${DOMAIN_PROMPTS[DOMAIN]}

Réponds SEULEMENT en JSON compact (pas d'espaces, clés abrégées):
[{"q":"question","a":[{"t":"rep1","c":0},{"t":"rep2","c":1},{"t":"rep3","c":0},{"t":"rep4","c":0}],"e":"explication"}]

Contraintes:
- q=question, a=answers, t=text, c=isCorrect (0/1), e=explanation
- 4 réponses par question, une seule correcte (c:1)
- Explication concise (1 phrase)
- JSON complet, pas de coupure

Génère ${count} questions:`;
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countTokens(str) {
  // Estimation grossière: ~4 caractères = 1 token
  return Math.ceil(str.length / 4);
}

function parseResponseNormal(content) {
  try {
    let jsonContent = content;

    // Extraire JSON des markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*(\[.*?\])\s*```/s);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1];
    } else {
      // Extraire le tableau directement
      const arrayMatch = content.match(/\[.*\]/s);
      if (arrayMatch) {
        jsonContent = arrayMatch[0];
      }
    }

    const questionsData = JSON.parse(jsonContent);

    if (!Array.isArray(questionsData)) {
      throw new Error("Response is not an array");
    }

    return questionsData;
  } catch (error) {
    console.error("Erreur parsing normal:", error.message);
    return null;
  }
}

function parseResponseCompact(content) {
  try {
    let jsonContent = content;

    // Extraire JSON (même logique que normal)
    const codeBlockMatch = content.match(/```(?:json)?\s*(\[.*?\])\s*```/s);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1];
    } else {
      const arrayMatch = content.match(/\[.*\]/s);
      if (arrayMatch) {
        jsonContent = arrayMatch[0];
      }
    }

    const questionsData = JSON.parse(jsonContent);

    if (!Array.isArray(questionsData)) {
      throw new Error("Response is not an array");
    }

    // Convertir le format compact en format normal
    return questionsData.map((q) => ({
      question: q.q,
      answers: q.a.map((a) => ({
        text: a.t,
        isCorrect: a.c === 1,
      })),
      explanation: q.e,
    }));
  } catch (error) {
    console.error("Erreur parsing compact:", error.message);
    return null;
  }
}

// ============================================
// FONCTIONS D'APPEL API
// ============================================

async function callAPIWithRetry(prompt, attempt = 1) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      console.log(
        `  → Tentative ${attempt + i}/${attempt + MAX_RETRIES - 1}...`,
      );

      const startTime = Date.now();
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
            "HTTP-Referer": "https://review-iabd-test.com",
            "X-Title": "Review IABD Test",
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              {
                role: "system",
                content: "Tu es un expert pédagogique en IA et Big Data.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            temperature: 0.7,
            max_tokens: 16000,
          }),
        },
      );

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error(
          `  ✗ Erreur API: ${response.status} - ${error.error?.message || response.statusText}`,
        );

        if (response.status === 429) {
          console.log(`  ⏳ Attente ${RETRY_DELAY}ms avant retry...`);
          await sleep(RETRY_DELAY);
          continue;
        }

        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        duration,
        data,
      };
    } catch (error) {
      console.error(`  ✗ Erreur: ${error.message}`);

      if (i < MAX_RETRIES - 1) {
        console.log(`  ⏳ Attente ${RETRY_DELAY}ms avant retry...`);
        await sleep(RETRY_DELAY);
      } else {
        throw error;
      }
    }
  }

  throw new Error("Max retries atteint");
}

// ============================================
// TESTS
// ============================================

async function testNormal() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 1: JSON NORMAL (implémentation actuelle)");
  console.log("=".repeat(70));

  const prompt = generatePromptNormal(QUESTION_COUNT);
  const promptTokens = countTokens(prompt);

  console.log(`\n📊 Configuration:`);
  console.log(`   - Modeèle: ${MODEL}`);
  console.log(`   - Questions demandées: ${QUESTION_COUNT}`);
  console.log(`   - Tokens prompt (estimé): ${promptTokens}`);

  try {
    const result = await callAPIWithRetry(prompt);

    const content = result.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Réponse vide");
    }

    const outputTokens = countTokens(content);
    const totalTokens =
      result.data.usage?.total_tokens || promptTokens + outputTokens;
    const inputTokens = result.data.usage?.prompt_tokens || promptTokens;
    const outputTokensReal =
      result.data.usage?.completion_tokens || outputTokens;

    console.log(`\n⏱️  Temps de réponse: ${result.duration}ms`);
    console.log(`\n📈 Token usage (API):`);
    console.log(`   - Input: ${inputTokens}`);
    console.log(`   - Output: ${outputTokensReal}`);
    console.log(`   - Total: ${totalTokens}`);

    console.log(`\n📦 Taille réponse: ${content.length} caractères`);

    const questions = parseResponseNormal(content);
    if (questions) {
      console.log(
        `\n✅ Parsing réussi! ${questions.length} questions générées`,
      );

      if (questions.length !== QUESTION_COUNT) {
        console.log(
          `⚠️  Attention: Demandé=${QUESTION_COUNT}, Reçu=${questions.length}`,
        );
      }

      // Exemple de question
      console.log(`\n📝 Exemple de question:`);
      const q = questions[0];
      console.log(`   Q: ${q.question.substring(0, 80)}...`);
      console.log(`   A: ${q.answers.length} réponses`);

      return {
        success: true,
        questions: questions.length,
        inputTokens,
        outputTokens: outputTokensReal,
        totalTokens,
        duration: result.duration,
        responseLength: content.length,
      };
    } else {
      console.log(`\n❌ Parsing échoué`);
      return { success: false, error: "Parsing failed" };
    }
  } catch (error) {
    console.log(`\n❌ Test échoué: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testCompact() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 2: JSON COMPACT (nouvelle implémentation)");
  console.log("=".repeat(70));

  const prompt = generatePromptCompact(QUESTION_COUNT);
  const promptTokens = countTokens(prompt);

  console.log(`\n📊 Configuration:`);
  console.log(`   - Modèle: ${MODEL}`);
  console.log(`   - Questions demandées: ${QUESTION_COUNT}`);
  console.log(`   - Tokens prompt (estimé): ${promptTokens}`);

  try {
    const result = await callAPIWithRetry(prompt);

    const content = result.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Réponse vide");
    }

    const outputTokens = countTokens(content);
    const totalTokens =
      result.data.usage?.total_tokens || promptTokens + outputTokens;
    const inputTokens = result.data.usage?.prompt_tokens || promptTokens;
    const outputTokensReal =
      result.data.usage?.completion_tokens || outputTokens;

    console.log(`\n⏱️  Temps de réponse: ${result.duration}ms`);
    console.log(`\n📈 Token usage (API):`);
    console.log(`   - Input: ${inputTokens}`);
    console.log(`   - Output: ${outputTokensReal}`);
    console.log(`   - Total: ${totalTokens}`);

    console.log(`\n📦 Taille réponse: ${content.length} caractères`);

    const questions = parseResponseCompact(content);
    if (questions) {
      console.log(
        `\n✅ Parsing réussi! ${questions.length} questions générées`,
      );

      if (questions.length !== QUESTION_COUNT) {
        console.log(
          `⚠️  Attention: Demandé=${QUESTION_COUNT}, Reçu=${questions.length}`,
        );
      }

      // Exemple de question
      console.log(`\n📝 Exemple de question:`);
      const q = questions[0];
      console.log(`   Q: ${q.question.substring(0, 80)}...`);
      console.log(`   A: ${q.answers.length} réponses`);

      return {
        success: true,
        questions: questions.length,
        inputTokens,
        outputTokens: outputTokensReal,
        totalTokens,
        duration: result.duration,
        responseLength: content.length,
      };
    } else {
      console.log(`\n❌ Parsing échoué`);
      return { success: false, error: "Parsing failed" };
    }
  } catch (error) {
    console.log(`\n❌ Test échoué: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ============================================
// RAPPORT DE COMPARAISON
// ============================================

function printComparison(normal, compact) {
  console.log("\n" + "=".repeat(70));
  console.log("📊 RAPPORT DE COMPARAISON");
  console.log("=".repeat(70));

  if (!normal.success || !compact.success) {
    console.log("\n❌ Impossible de comparer: un des tests a échoué");
    return;
  }

  console.log(
    "\n┌─────────────────────────────────────────────────────────────────────────┐",
  );
  console.log(
    "│                          COMPARAISON                                       │",
  );
  console.log(
    "├─────────────────────────────────────────────────────────────────────────┤",
  );

  // Tokens input
  const inputDiff = normal.inputTokens - compact.inputTokens;
  const inputPercent = ((inputDiff / normal.inputTokens) * 100).toFixed(1);
  console.log(
    `│ Input Tokens (Prompt)                                                     │`,
  );
  console.log(
    `│   Normal:  ${normal.inputTokens.toString().padStart(5)}  Compact: ${compact.inputTokens.toString().padStart(5)}  │`,
  );
  console.log(
    `│   Économie: ${inputDiff > 0 ? "✓" : ""} ${inputDiff.toString().padStart(5)} tokens (${inputPercent}%)           │`,
  );

  // Tokens output
  const outputDiff = normal.outputTokens - compact.outputTokens;
  const outputPercent = ((outputDiff / normal.outputTokens) * 100).toFixed(1);
  console.log(
    `├─────────────────────────────────────────────────────────────────────────┤`,
  );
  console.log(
    `│ Output Tokens (Réponse)                                                   │`,
  );
  console.log(
    `│   Normal:  ${normal.outputTokens.toString().padStart(5)}  Compact: ${compact.outputTokens.toString().padStart(5)}  │`,
  );
  console.log(
    `│   Économie: ${outputDiff > 0 ? "✓" : ""} ${outputDiff.toString().padStart(5)} tokens (${outputPercent}%)            │`,
  );

  // Total tokens
  const totalDiff = normal.totalTokens - compact.totalTokens;
  const totalPercent = ((totalDiff / normal.totalTokens) * 100).toFixed(1);
  console.log(
    `├─────────────────────────────────────────────────────────────────────────┤`,
  );
  console.log(
    `│ Total Tokens                                                              │`,
  );
  console.log(
    `│   Normal:  ${normal.totalTokens.toString().padStart(5)}  Compact: ${compact.totalTokens.toString().padStart(5)}  │`,
  );
  console.log(
    `│   Économie: ${totalDiff > 0 ? "✓" : ""} ${totalDiff.toString().padStart(5)} tokens (${totalPercent}%)            │`,
  );

  // Temps
  const timeDiff = normal.duration - compact.duration;
  const timePercent = ((timeDiff / normal.duration) * 100).toFixed(1);
  console.log(
    `├─────────────────────────────────────────────────────────────────────────┤`,
  );
  console.log(
    `│ Temps de réponse                                                          │`,
  );
  console.log(
    `│   Normal:  ${normal.duration.toString().padStart(5)}ms  Compact: ${compact.duration.toString().padStart(5)}ms  │`,
  );
  console.log(
    `│   Diff:    ${timeDiff > 0 ? "-" : "+"}${Math.abs(timeDiff).toString().padStart(5)}ms (${timePercent}%)                 │`,
  );

  // Taille réponse
  const sizeDiff = normal.responseLength - compact.responseLength;
  const sizePercent = ((sizeDiff / normal.responseLength) * 100).toFixed(1);
  console.log(
    `├─────────────────────────────────────────────────────────────────────────┤`,
  );
  console.log(
    `│ Taille réponse (caractères)                                               │`,
  );
  console.log(
    `│   Normal:  ${normal.responseLength.toString().padStart(6)}  Compact: ${compact.responseLength.toString().padStart(6)}  │`,
  );
  console.log(
    `│   Économie: ${sizeDiff > 0 ? "✓" : ""} ${sizeDiff.toString().padStart(5)} chars (${sizePercent}%)              │`,
  );

  console.log(
    "└─────────────────────────────────────────────────────────────────────────┘",
  );

  // Analyse
  console.log("\n💡 ANALYSE:");
  console.log(
    `   • Économie de tokens par question: ${(outputDiff / QUESTION_COUNT).toFixed(0)} tokens`,
  );
  console.log(
    `   • Questions possibles avec même budget:`,
    Math.floor(normal.outputTokens / (compact.outputTokens / QUESTION_COUNT)),
    `(au lieu de ${QUESTION_COUNT})`,
  );

  if (outputDiff > 0) {
    const increase = Math.floor(
      (outputDiff / compact.outputTokens) * QUESTION_COUNT,
    );
    console.log(
      `   📈 Potentiel d'augmentation du batch: ~${increase} questions supplémentaires`,
    );
  } else {
    console.log(`   ⚠️  JSON compact n'est pas plus efficace dans ce cas`);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log(
    "╔═══════════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║          SCRIPT DE TEST: JSON NORMAL vs JSON COMPACT                      ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════════════════╝",
  );

  if (API_KEY === "VOTRE_API_KEY_ICI") {
    console.error(
      "\n❌ ERREUR: Veuillez configurer votre API_KEY dans le script",
    );
    console.log('   Modifiez la ligne: const API_KEY = "VOTRE_API_KEY_ICI"');
    process.exit(1);
  }

  console.log(`\n⚙️  Configuration:`);
  console.log(`   - Questions: ${QUESTION_COUNT}`);
  console.log(`   - Domaine: ${DOMAIN}`);
  console.log(`   - Modèle: ${MODEL}`);
  console.log(`   - Retries: ${MAX_RETRIES}`);

  // Test 1: Normal
  const normalResult = await testNormal();

  // Pause entre tests
  console.log("\n⏳ Pause de 3 secondes avant le prochain test...");
  await sleep(3000);

  // Test 2: Compact
  const compactResult = await testCompact();

  // Comparaison
  printComparison(normalResult, compactResult);

  console.log("\n" + "=".repeat(70));
  console.log("✅ Tests terminés!");
  console.log("=".repeat(70));
}

// Run
main().catch(console.error);
