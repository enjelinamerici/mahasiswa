<?php

use CodeIgniter\Router\RouteCollection;

/** @var RouteCollection $routes */
$routes->get('/', 'Home::index');

$routes->group('api/v1', ['namespace' => 'App\Controllers\Api'], static function ($routes) {
    $routes->post('auth/login', 'Auth::login');

    // admin, operator, mahasiswa (role service TIDAK boleh membaca data lengkap)
    $routes->group('', ['filter' => 'jwt:admin,operator,mahasiswa'], static function ($routes) {
        $routes->get('mahasiswa', 'Mahasiswa::index');
        $routes->get('mahasiswa/(:segment)', 'Mahasiswa::show/$1');
        $routes->get('kelas', 'Kelas::index');
        $routes->get('kelas/(:num)/mahasiswa', 'Kelas::mahasiswa/$1');
        $routes->get('agama', 'Referensi::agama');
        $routes->get('suku', 'Referensi::suku');
    });

    // admin dan operator
    $routes->group('', ['filter' => 'jwt:admin,operator'], static function ($routes) {
        $routes->post('mahasiswa', 'Mahasiswa::create');
        $routes->put('mahasiswa/(:segment)', 'Mahasiswa::update/$1');
        $routes->patch('mahasiswa/(:segment)/kelas', 'Mahasiswa::pindahKelas/$1');
    });

    // admin saja
    $routes->group('', ['filter' => 'jwt:admin'], static function ($routes) {
        $routes->delete('mahasiswa/(:segment)', 'Mahasiswa::delete/$1');
    });

       // untuk kelompok lain: hanya data publik
    $routes->group('', ['filter' => 'jwt:service,admin'], static function ($routes) {
        $routes->get('integrasi/kelas', 'Integrasi::kelas');
        $routes->get('integrasi/mahasiswa', 'Integrasi::mahasiswa');
        $routes->get('integrasi/mahasiswa/(:segment)', 'Integrasi::show/$1');
        $routes->get('integrasi/rekap', 'Integrasi::rekap');
    });
});