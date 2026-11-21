<?php

namespace App\Controllers\Api;

class Referensi extends BaseApi
{
    // GET /api/v1/agama
    public function agama()
    {
        return $this->sukses(
            \Config\Database::connect()->query('SELECT id, nama FROM akademik.agama ORDER BY nama')->getResultArray()
        );
    }

    // GET /api/v1/suku
    public function suku()
    {
        return $this->sukses(
            \Config\Database::connect()->query('SELECT id, nama FROM akademik.suku ORDER BY nama')->getResultArray()
        );
    }
}