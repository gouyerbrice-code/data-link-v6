# DATALINK — Benchmark Splink PMM ↔ PMB

## Objectif

Comparer Splink au moteur déterministe actuel sur les mêmes données PMM/PMB, sans modifier la décision métier ni la master base.

## Protocole

1. Utiliser exactement les mêmes snapshots normalisés PMM et PMB.
2. Conserver `_datalink_id` comme identifiant technique stable.
3. Exécuter le moteur déterministe comme référence actuelle.
4. Exécuter Splink en mode `shadow`.
5. Ne jamais écrire automatiquement une proposition Splink dans la master base.
6. Exporter les écarts pour validation humaine.

## Configuration de départ

Exemple :

```json
{
  "comparison_fields": [
    {"field": "ean", "type": "exact", "blocking": true},
    {"field": "reference", "type": "jaro_winkler", "blocking": true},
    {"field": "designation", "type": "jaro_winkler", "blocking": false}
  ],
  "blocking_fields": ["ean", "reference"],
  "threshold_match_probability": 0.90
}
```

Adapter les noms de champs aux colonnes réellement présentes dans les snapshots PMM/PMB.

## Mesures

Le benchmark doit produire au minimum :

- nombre de lignes PMM ;
- nombre de lignes PMB ;
- nombre de paires candidates ;
- nombre de matches Splink ;
- nombre de matches déterministes ;
- paires communes ;
- paires uniquement Splink ;
- paires uniquement déterministes ;
- taux d'accord ;
- distribution des probabilités Splink ;
- temps d'exécution ;
- erreurs et champs manquants.

## Validation humaine

Créer un échantillon des écarts :

- Splink seul : vérifier faux positifs/faux négatifs ;
- déterministe seul : vérifier les cas manqués par Splink ;
- communs : contrôler la cohérence sur un échantillon.

Aucune règle de promotion ne doit être décidée avant cette validation.

## Critère de promotion

La promotion de Splink doit être décidée après mesure sur les données réelles et validation humaine. Le mode `shadow` reste la voie de référence pendant cette phase.
