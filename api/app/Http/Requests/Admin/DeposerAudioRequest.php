<?php

namespace App\Http\Requests\Admin;

use App\Models\CleAudio;
use App\Services\Catalogue;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\File;

/** POST /admin/audio multipart { cle, langue, fichier } — la vérification du type RÉEL est faite ensuite (InspecteurAudio). */
class DeposerAudioRequest extends FormRequest
{
    public const MIMES = [
        'audio/mpeg', 'audio/mp3',
        'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
        'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'video/mp4', // m4a (Safari MediaRecorder) est souvent détecté video/mp4
        'audio/ogg', 'application/ogg',
        'audio/webm', 'video/webm',
    ];

    public function authorize(): bool
    {
        return $this->user()?->estSuperAdmin() === true;
    }

    public function rules(): array
    {
        return [
            'cle' => ['required', 'string', 'max:120', 'regex:'.CleAudio::REGEX, Rule::exists('cles_audio', 'cle')],
            'langue' => ['required', 'string', Rule::in(Catalogue::codesLanguesActives())],
            // Type MIME détecté sur le CONTENU (fileinfo), jamais l'extension : mp3, wav, m4a, ogg, webm.
            'fichier' => [
                'required',
                File::types(self::MIMES)->max((int) config('satspoint.audio.taille_max_ko')),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'cle.exists' => 'Cette clé vocale n\'existe pas dans le registre.',
            'fichier.max' => 'Le fichier dépasse 2 Mo.',
            'fichier.mimetypes' => 'Formats acceptés : mp3, wav, m4a, ogg, webm.',
        ];
    }
}
