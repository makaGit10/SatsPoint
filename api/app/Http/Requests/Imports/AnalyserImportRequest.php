<?php

namespace App\Http\Requests\Imports;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\File;

/** POST /imports/analyser multipart { fichier } : CSV ou XLSX ≤ 2 Mo (type réel vérifié ensuite par signature). */
class AnalyserImportRequest extends FormRequest
{
    public const MIMES = [
        'text/plain', 'text/csv', 'text/x-csv', 'application/csv', 'application/x-csv', 'text/comma-separated-values', 'text/tab-separated-values',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream',
    ];

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'fichier' => ['required', File::types(self::MIMES)->max((int) config('satspoint.import.taille_max_ko'))],
            // Seul type importable en vague 3 : les articles (défaut).
            'type' => ['sometimes', 'string', 'in:articles'],
        ];
    }

    public function messages(): array
    {
        return [
            'fichier.max' => 'Le fichier dépasse 2 Mo.',
            'fichier.mimetypes' => 'Formats acceptés : CSV ou Excel (.xlsx).',
        ];
    }
}
