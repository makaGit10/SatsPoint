<?php

namespace App\Rules;

use App\Support\Identifiant;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class IdentifiantValide implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || Identifiant::normaliser($value) === null) {
            $fail('Indiquez une adresse e-mail valide ou un numéro de téléphone (ex. 77 123 45 67).');
        }
    }
}
