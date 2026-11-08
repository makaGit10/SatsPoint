<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Rapport des ventes — {{ $boutique->nom }}</title>
    <style>
        @page { margin: 18mm 14mm; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 10px; color: #111827; }
        h1 { font-size: 16px; margin: 0 0 2px; }
        .sous-titre { color: #6B7280; margin-bottom: 12px; }
        .tuiles { width: 100%; border-collapse: separate; border-spacing: 6px 0; margin: 0 -6px 12px; }
        .tuile { border: 1px solid #E5E7EB; border-radius: 6px; padding: 8px 10px; width: 25%; }
        .tuile .libelle { color: #6B7280; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
        .tuile .valeur { font-size: 14px; font-weight: bold; margin-top: 2px; }
        table.liste { width: 100%; border-collapse: collapse; }
        table.liste th { text-align: left; background: #F3F4F6; padding: 5px 6px; border-bottom: 1px solid #D1D5DB; font-size: 9px; text-transform: uppercase; color: #374151; }
        table.liste td { padding: 4px 6px; border-bottom: 1px solid #F3F4F6; }
        .droite { text-align: right; }
        .muet { color: #6B7280; }
        .note { margin-top: 10px; color: #6B7280; font-style: italic; }
        .pied { position: fixed; bottom: -8mm; left: 0; right: 0; color: #9CA3AF; font-size: 8px; text-align: center; }
    </style>
</head>
<body>
    <h1>{{ $boutique->nom }} — rapport des ventes</h1>
    <div class="sous-titre">
        {{ $boutique->ville }} · période : {{ $periode['libelle'] }} · généré le {{ $genere_le }}
    </div>

    <table class="tuiles">
        <tr>
            <td class="tuile"><div class="libelle">Ventes</div><div class="valeur">{{ number_format($totaux['nombre'], 0, ',', ' ') }}</div></td>
            <td class="tuile"><div class="libelle">Montant total</div><div class="valeur">{{ number_format($totaux['montant_xof'], 0, ',', ' ') }} FCFA</div></td>
            <td class="tuile"><div class="libelle">Encaissé (payées)</div><div class="valeur">{{ number_format($totaux['payees_xof'], 0, ',', ' ') }} FCFA</div></td>
            <td class="tuile"><div class="libelle">Panier moyen</div><div class="valeur">{{ $totaux['nombre'] > 0 ? number_format((int) round($totaux['montant_xof'] / $totaux['nombre']), 0, ',', ' ') : 0 }} FCFA</div></td>
        </tr>
    </table>

    @if ($repartition !== [])
        <table class="liste" style="margin-bottom: 12px; width: 60%;">
            <thead><tr><th>Moyen de paiement</th><th class="droite">Ventes payées</th><th class="droite">Montant (FCFA)</th></tr></thead>
            <tbody>
            @foreach ($repartition as $r)
                <tr><td>{{ $r['moyen'] }}</td><td class="droite">{{ $r['nombre'] }}</td><td class="droite">{{ number_format($r['montant'], 0, ',', ' ') }}</td></tr>
            @endforeach
            </tbody>
        </table>
    @endif

    <table class="liste">
        <thead>
            <tr>
                <th>N°</th><th>Date</th><th>Heure</th><th class="droite">Montant</th><th>Statut</th><th>Moyen</th><th class="droite">Sats</th><th>Caissier</th><th>Note</th>
            </tr>
        </thead>
        <tbody>
        @forelse ($lignes as $l)
            <tr>
                <td>{{ $l['numero'] }}</td>
                <td>{{ $l['date'] }}</td>
                <td>{{ $l['heure'] }}</td>
                <td class="droite">{{ number_format($l['montant'], 0, ',', ' ') }}</td>
                <td>{{ $l['statut'] }}</td>
                <td>{{ $l['moyen'] }}</td>
                <td class="droite">{{ $l['sats'] !== null ? number_format($l['sats'], 0, ',', ' ') : '' }}</td>
                <td>{{ $l['caissier'] }}</td>
                <td class="muet">{{ $l['note'] }}</td>
            </tr>
        @empty
            <tr><td colspan="9" class="muet">Aucune vente sur la période.</td></tr>
        @endforelse
        </tbody>
    </table>

    @if ($tronque)
        <p class="note">Liste limitée aux {{ $max }} premières ventes ; les totaux portent sur l'ensemble. Utilisez l'export CSV ou Excel pour le détail complet.</p>
    @endif

    <div class="pied">SatsPoint · {{ $boutique->nom }} · rapport généré le {{ $genere_le }}</div>
</body>
</html>
