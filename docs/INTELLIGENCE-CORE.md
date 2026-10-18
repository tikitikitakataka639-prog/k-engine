# KERNEL Intelligence Core (v1.6.0)

## Arquitectura

```
injectPersonality (todos los modelos)
  → runPreInference
      → evidenceAnalyzer.analyzeEvidence
      → moralReasoner.evaluateMoralAction
      → buildIntelligenceContext  → system prompt
  → mathTools (si aplica)
  → generate (WebLLM local)
  → finalizeAssistantText
      → moralReasoner (bloquea facilitación de daño)
      → math override
      → outputGuard
```

## Módulos

| Módulo | Archivo | Función |
|--------|---------|----------|
| evidenceAnalyzer | intelligence/evidenceAnalyzer.js | Hechos, indicios, alternativas, lagunas, riskLevel |
| moralReasoner | intelligence/moralReasoner.js | stop facilitación vs allow denuncia |
| reportGenerator | intelligence/reportGenerator.js | Denuncias + límites Unicode |
| outputValidator | intelligence/outputValidator.js | validateAssessment / validateReport |
| intelligenceCore | intelligenceCore.js | Orquestador + API pública |

## Principio

Evidencia > intuición / presión social / deseo de complacer.
Heurísticas = avisos de revisión, no veredictos de culpabilidad.

## Pruebas

```bash
npm run test:intel
```

12 criterios del brief cubiertos en tests/intelligenceCore.test.js.
