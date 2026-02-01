-- =====================================================
-- SISTEMA DE INVENTARIO - MICROMERCADO MUÑOZ
-- Schema mejorado por Tony con triggers adicionales
-- =====================================================
-- Características:
-- - AES Encrypt para contraseñas (varbinary)
-- - Trigger PPP (Precio Promedio Ponderado)
-- - Trigger FIFO para lotes
-- - Validación de stock antes de venta
-- - Logs del sistema para auditoría
-- - Estados ACTIVO/ANULADO en movimientos
-- =====================================================

-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 01-02-2026 a las 00:23:47
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `micromercado_munoz`
--

CREATE DATABASE IF NOT EXISTS `micromercado_munoz`;
USE `micromercado_munoz`;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ajustes_inventario`
--

CREATE TABLE `ajustes_inventario` (
  `ajuid` int(11) NOT NULL,
  `prodid` int(11) NOT NULL,
  `usuid` int(11) DEFAULT NULL,
  `ajutipo` enum('AUMENTO','DISMINUCION') NOT NULL,
  `ajucantidad` int(11) NOT NULL,
  `ajumotivo` varchar(255) DEFAULT NULL,
  `ajufecha` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Disparadores `ajustes_inventario`
--
DELIMITER $$
CREATE TRIGGER `trg_ajuste_stock` AFTER INSERT ON `ajustes_inventario` FOR EACH ROW BEGIN
    IF NEW.ajutipo = 'AUMENTO' THEN
        UPDATE productos SET prodstock = prodstock + NEW.ajucantidad WHERE prodid = NEW.prodid;
    ELSE
        UPDATE productos SET prodstock = prodstock - NEW.ajucantidad WHERE prodid = NEW.prodid;
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `categorias`
--

CREATE TABLE `categorias` (
  `catid` int(11) NOT NULL,
  `catnombre` varchar(64) NOT NULL,
  `catdescripcion` text DEFAULT NULL,
  `catactivo` tinyint(1) DEFAULT 1,
  `catcreacion` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `categorias`
--

INSERT INTO `categorias` (`catid`, `catnombre`, `catdescripcion`, `catactivo`, `catcreacion`) VALUES
(1, 'Lácteos', 'Productos lácteos y derivados', 1, '2026-01-31 22:57:53'),
(2, 'Bebidas', 'Bebidas gaseosas, jugos y aguas', 1, '2026-01-31 22:57:53'),
(3, 'Snacks', 'Productos de snacks y golosinas', 1, '2026-01-31 22:57:53'),
(4, 'Limpieza', 'Productos de limpieza del hogar', 1, '2026-01-31 22:57:53'),
(5, 'Abarrotes', 'Productos de abarrotes en general', 1, '2026-01-31 22:57:53');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `descuentos`
--

CREATE TABLE `descuentos` (
  `descid` int(11) NOT NULL,
  `catid` int(11) DEFAULT NULL,
  `prodid` int(11) DEFAULT NULL,
  `descnombre` varchar(100) DEFAULT NULL,
  `descporcentaje` decimal(5,2) NOT NULL DEFAULT 0.00,
  `descmonto` decimal(10,2) DEFAULT 0.00,
  `descfechainicio` date NOT NULL,
  `descfechafin` date NOT NULL,
  `descactivo` tinyint(1) DEFAULT 1,
  `desccreaion` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detalle_entradas`
--

CREATE TABLE `detalle_entradas` (
  `dentid` int(11) NOT NULL,
  `entid` int(11) NOT NULL,
  `prodid` int(11) NOT NULL,
  `dentcantidad` int(11) NOT NULL CHECK (`dentcantidad` > 0),
  `dentpreciocompra` decimal(10,2) NOT NULL,
  `dentsubtotal` decimal(12,2) GENERATED ALWAYS AS (`dentcantidad` * `dentpreciocompra`) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Disparadores `detalle_entradas`
--
DELIMITER $$
CREATE TRIGGER `trg_actualizar_precio_ppp` BEFORE INSERT ON `detalle_entradas` FOR EACH ROW BEGIN
    DECLARE stock_actual INT;
    DECLARE precio_actual DECIMAL(10,2);
    
    SELECT prodstock, prodpreciocompra INTO stock_actual, precio_actual 
    FROM productos WHERE prodid = NEW.prodid;
    IF (stock_actual + NEW.dentcantidad) > 0 THEN
        UPDATE productos 
        SET prodpreciocompra = ((stock_actual * precio_actual) + (NEW.dentcantidad * NEW.dentpreciocompra)) / (stock_actual + NEW.dentcantidad)
        WHERE prodid = NEW.prodid;
    END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_entrada_stock_insert` AFTER INSERT ON `detalle_entradas` FOR EACH ROW BEGIN
    UPDATE productos 
    SET prodstock = prodstock + NEW.dentcantidad
    WHERE prodid = NEW.prodid;

    INSERT INTO lotes (prodid, dentid, lotcantidad, lotcantidaddisponible, lotpreciocompra)
    VALUES (NEW.prodid, NEW.dentid, NEW.dentcantidad, NEW.dentcantidad, NEW.dentpreciocompra);
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detalle_salidas`
--

CREATE TABLE `detalle_salidas` (
  `dsalid` int(11) NOT NULL,
  `salid` int(11) NOT NULL,
  `prodid` int(11) NOT NULL,
  `descid` int(11) DEFAULT NULL,
  `dsalcantidad` int(11) NOT NULL CHECK (`dsalcantidad` > 0),
  `dsalprecioventa` decimal(10,2) NOT NULL,
  `dsaldescuento` decimal(5,2) DEFAULT 0.00,
  `dsalsubtotal` decimal(12,2) GENERATED ALWAYS AS (`dsalcantidad` * `dsalprecioventa` * (1 - `dsaldescuento` / 100)) STORED,
  `dsaliva` decimal(12,2) GENERATED ALWAYS AS (`dsalcantidad` * `dsalprecioventa` * (1 - `dsaldescuento` / 100) * 0.15) STORED,
  `dsaltotal` decimal(12,2) GENERATED ALWAYS AS (`dsalcantidad` * `dsalprecioventa` * (1 - `dsaldescuento` / 100) * 1.15) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Disparadores `detalle_salidas`
--
DELIMITER $$
CREATE TRIGGER `trg_salida_fifo_lotes` AFTER INSERT ON `detalle_salidas` FOR EACH ROW BEGIN
    DECLARE cant_a_descontar INT;
    SET cant_a_descontar = NEW.dsalcantidad;
    WHILE cant_a_descontar > 0 DO
        UPDATE lotes 
        SET lotcantidaddisponible = CASE 
            WHEN lotcantidaddisponible >= cant_a_descontar THEN lotcantidaddisponible - cant_a_descontar
            ELSE 0 
        END,
        cant_a_descontar = CASE 
            WHEN lotcantidaddisponible >= cant_a_descontar THEN 0
            ELSE cant_a_descontar - lotcantidaddisponible
        END
        WHERE prodid = NEW.prodid AND lotcantidaddisponible > 0
        ORDER BY lotfechavencimiento ASC, lotid ASC
        LIMIT 1;
    END WHILE;
    
    UPDATE productos 
    SET prodstock = prodstock - NEW.dsalcantidad 
    WHERE prodid = NEW.prodid;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_validar_stock_antes_venta` BEFORE INSERT ON `detalle_salidas` FOR EACH ROW BEGIN
    DECLARE stock_disponible INT;
    
    SELECT prodstock INTO stock_disponible 
    FROM productos WHERE prodid = NEW.prodid;
    
    IF stock_disponible < NEW.dsalcantidad THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Error: Stock insuficiente para realizar la venta';
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `entradas`
--

CREATE TABLE `entradas` (
  `entid` int(11) NOT NULL,
  `provid` int(11) DEFAULT NULL,
  `usuid` int(11) DEFAULT NULL,
  `entnumero` varchar(50) DEFAULT NULL,
  `entfecha` timestamp NOT NULL DEFAULT current_timestamp(),
  `entsubtotal` decimal(12,2) DEFAULT 0.00,
  `entiva` decimal(12,2) DEFAULT 0.00,
  `enttotal` decimal(12,2) DEFAULT 0.00,
  `entestado` enum('ACTIVO','ANULADO') DEFAULT 'ACTIVO',
  `entobservaciones` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `logs_sistema`
--

CREATE TABLE `logs_sistema` (
  `logid` int(11) NOT NULL,
  `tabla_afectada` varchar(50) DEFAULT NULL,
  `registro_id` int(11) DEFAULT NULL,
  `accion` varchar(20) DEFAULT NULL,
  `usuid` int(11) DEFAULT NULL,
  `fecha` timestamp NOT NULL DEFAULT current_timestamp(),
  `detalle` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `lotes`
--

CREATE TABLE `lotes` (
  `lotid` int(11) NOT NULL,
  `prodid` int(11) NOT NULL,
  `dentid` int(11) DEFAULT NULL,
  `lotcantidad` int(11) NOT NULL,
  `lotcantidaddisponible` int(11) NOT NULL,
  `lotpreciocompra` decimal(10,2) NOT NULL,
  `lotfechaingreso` timestamp NOT NULL DEFAULT current_timestamp(),
  `lotfechavencimiento` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `productos`
--

CREATE TABLE `productos` (
  `prodid` int(11) NOT NULL,
  `catid` int(11) DEFAULT NULL,
  `provid` int(11) DEFAULT NULL,
  `prodcodigo` varchar(50) NOT NULL,
  `prodnombre` varchar(128) NOT NULL,
  `proddescripcion` text DEFAULT NULL,
  `prodpreciocompra` decimal(10,2) DEFAULT 0.00,
  `prodprecioventa` decimal(10,2) NOT NULL,
  `prodstock` int(11) DEFAULT 0 CHECK (`prodstock` >= 0),
  `prodstockminimo` int(11) DEFAULT 5,
  `prodfechavencimiento` date DEFAULT NULL,
  `prodactivo` tinyint(1) DEFAULT 1,
  `prodcreacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `prodactualizado` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Disparadores `productos`
--
DELIMITER $$
CREATE TRIGGER `trg_log_cambio_precios` AFTER UPDATE ON `productos` FOR EACH ROW BEGIN
    IF OLD.prodprecioventa <> NEW.prodprecioventa THEN
        INSERT INTO logs_sistema (tabla_afectada, registro_id, accion, detalle)
        VALUES ('productos', NEW.prodid, 'ACTUALIZACION', 
                CONCAT('Precio venta cambió de ', OLD.prodprecioventa, ' a ', NEW.prodprecioventa));
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `proveedores`
--

CREATE TABLE `proveedores` (
  `provid` int(11) NOT NULL,
  `provnombre` varchar(128) NOT NULL,
  `provcontacto` varchar(100) DEFAULT NULL,
  `provtelefono` varchar(20) DEFAULT NULL,
  `provemail` varchar(100) DEFAULT NULL,
  `provdireccion` text DEFAULT NULL,
  `provempresa` varchar(128) DEFAULT NULL,
  `provactivo` tinyint(1) DEFAULT 1,
  `provcreacion` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `proveedores`
--

INSERT INTO `proveedores` (`provid`, `provnombre`, `provcontacto`, `provtelefono`, `provemail`, `provdireccion`, `provempresa`, `provactivo`, `provcreacion`) VALUES
(1, 'Juan Distribuidor', NULL, '0999123456', NULL, NULL, 'Distribuidora Central', 1, '2026-01-31 22:57:53');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `roles`
--

CREATE TABLE `roles` (
  `rolid` int(11) NOT NULL,
  `rolnombre` varchar(64) NOT NULL,
  `roldescripcion` varchar(128) DEFAULT NULL,
  `rolactivo` tinyint(1) DEFAULT 1,
  `rolcreacion` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `roles`
--

INSERT INTO `roles` (`rolid`, `rolnombre`, `roldescripcion`, `rolactivo`, `rolcreacion`) VALUES
(1, 'ADMIN', 'Administrador del sistema - acceso total', 1, '2026-01-31 22:57:52'),
(2, 'VENDEDOR', 'Vendedor - puede registrar ventas', 1, '2026-01-31 22:57:52'),
(3, 'BODEGUERO', 'Bodeguero - puede registrar entradas', 1, '2026-01-31 22:57:52');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `salidas`
--

CREATE TABLE `salidas` (
  `salid` int(11) NOT NULL,
  `usuid` int(11) DEFAULT NULL,
  `salnumero` varchar(50) DEFAULT NULL,
  `salfecha` timestamp NOT NULL DEFAULT current_timestamp(),
  `salmetodovaloracion` enum('PROMEDIO','FIFO','LIFO') DEFAULT 'PROMEDIO',
  `salsubtotal` decimal(12,2) DEFAULT 0.00,
  `saliva` decimal(12,2) DEFAULT 0.00,
  `saltotal` decimal(12,2) DEFAULT 0.00,
  `salestado` enum('ACTIVO','ANULADO') DEFAULT 'ACTIVO',
  `salobservaciones` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `usuid` int(11) NOT NULL,
  `rolid` int(11) NOT NULL,
  `usunombres` varchar(100) NOT NULL,
  `usuapellidos` varchar(100) NOT NULL,
  `usuemail` varchar(100) DEFAULT NULL,
  `usuusuario` varchar(64) NOT NULL,
  `usucontrasena` varbinary(128) NOT NULL,
  `usuactivo` tinyint(1) DEFAULT 1,
  `usucreacion` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `usuarios`
-- Contraseña: admin123 encriptada con AES_ENCRYPT
--

INSERT INTO `usuarios` (`usuid`, `rolid`, `usunombres`, `usuapellidos`, `usuemail`, `usuusuario`, `usucontrasena`, `usuactivo`, `usucreacion`) VALUES
(1, 1, 'Administrador', 'Sistema', NULL, 'admin', AES_ENCRYPT('admin123', 'micromercado_key'), 1, '2026-01-31 22:57:53');

-- --------------------------------------------------------

--
-- Estructura para la vista `v_kardex`
--

CREATE VIEW `v_kardex` AS 
SELECT 'ENTRADA' AS `tipo`, `e`.`entfecha` AS `fecha`, `de`.`prodid` AS `prodid`, `p`.`prodnombre` AS `prodnombre`, `de`.`dentcantidad` AS `cantidad`, `de`.`dentpreciocompra` AS `precio_unitario`, `de`.`dentsubtotal` AS `total`, `e`.`entobservaciones` AS `observacion` 
FROM ((`detalle_entradas` `de` join `entradas` `e` on(`de`.`entid` = `e`.`entid`)) join `productos` `p` on(`de`.`prodid` = `p`.`prodid`))
UNION ALL 
SELECT 'SALIDA' AS `tipo`,`s`.`salfecha` AS `fecha`,`ds`.`prodid` AS `prodid`,`p`.`prodnombre` AS `prodnombre`,`ds`.`dsalcantidad` AS `cantidad`,`ds`.`dsalprecioventa` AS `precio_unitario`,`ds`.`dsaltotal` AS `total`,`s`.`salobservaciones` AS `observacion` 
FROM ((`detalle_salidas` `ds` join `salidas` `s` on(`ds`.`salid` = `s`.`salid`)) join `productos` `p` on(`ds`.`prodid` = `p`.`prodid`)) 
ORDER BY `fecha` DESC;

-- --------------------------------------------------------

--
-- Estructura para la vista `v_productos_por_vencer`
--

CREATE VIEW `v_productos_por_vencer` AS 
SELECT `p`.`prodid` AS `prodid`, `p`.`prodcodigo` AS `prodcodigo`, `p`.`prodnombre` AS `prodnombre`, `p`.`prodfechavencimiento` AS `prodfechavencimiento`, DATEDIFF(`p`.`prodfechavencimiento`, CURDATE()) AS `dias_restantes`, `p`.`prodstock` AS `prodstock`, `c`.`catnombre` AS `categoria` 
FROM (`productos` `p` left join `categorias` `c` on(`p`.`catid` = `c`.`catid`)) 
WHERE `p`.`prodfechavencimiento` is not null AND `p`.`prodfechavencimiento` <= CURDATE() + interval 30 day AND `p`.`prodfechavencimiento` >= CURDATE() AND `p`.`prodactivo` = 1 
ORDER BY `dias_restantes` ASC;

-- --------------------------------------------------------

--
-- Estructura para la vista `v_productos_stock_bajo`
--

CREATE VIEW `v_productos_stock_bajo` AS 
SELECT `p`.`prodid` AS `prodid`, `p`.`prodcodigo` AS `prodcodigo`, `p`.`prodnombre` AS `prodnombre`, `p`.`prodstock` AS `prodstock`, `p`.`prodstockminimo` AS `prodstockminimo`, `c`.`catnombre` AS `categoria`, `pr`.`provnombre` AS `proveedor` 
FROM ((`productos` `p` left join `categorias` `c` on(`p`.`catid` = `c`.`catid`)) left join `proveedores` `pr` on(`p`.`provid` = `pr`.`provid`)) 
WHERE `p`.`prodstock` <= `p`.`prodstockminimo` AND `p`.`prodactivo` = 1;

--
-- Índices para tablas volcadas
--

ALTER TABLE `ajustes_inventario`
  ADD PRIMARY KEY (`ajuid`),
  ADD KEY `prodid` (`prodid`),
  ADD KEY `usuid` (`usuid`);

ALTER TABLE `categorias`
  ADD PRIMARY KEY (`catid`),
  ADD UNIQUE KEY `catnombre` (`catnombre`);

ALTER TABLE `descuentos`
  ADD PRIMARY KEY (`descid`),
  ADD KEY `catid` (`catid`),
  ADD KEY `prodid` (`prodid`),
  ADD KEY `idx_fechas` (`descfechainicio`,`descfechafin`);

ALTER TABLE `detalle_entradas`
  ADD PRIMARY KEY (`dentid`),
  ADD KEY `entid` (`entid`),
  ADD KEY `prodid` (`prodid`);

ALTER TABLE `detalle_salidas`
  ADD PRIMARY KEY (`dsalid`),
  ADD KEY `salid` (`salid`),
  ADD KEY `prodid` (`prodid`),
  ADD KEY `descid` (`descid`);

ALTER TABLE `entradas`
  ADD PRIMARY KEY (`entid`),
  ADD KEY `provid` (`provid`),
  ADD KEY `usuid` (`usuid`);

ALTER TABLE `logs_sistema`
  ADD PRIMARY KEY (`logid`);

ALTER TABLE `lotes`
  ADD PRIMARY KEY (`lotid`),
  ADD KEY `prodid` (`prodid`),
  ADD KEY `dentid` (`dentid`);

ALTER TABLE `productos`
  ADD PRIMARY KEY (`prodid`),
  ADD UNIQUE KEY `prodcodigo` (`prodcodigo`),
  ADD KEY `catid` (`catid`),
  ADD KEY `provid` (`provid`);

ALTER TABLE `proveedores`
  ADD PRIMARY KEY (`provid`);

ALTER TABLE `roles`
  ADD PRIMARY KEY (`rolid`),
  ADD UNIQUE KEY `rolnombre` (`rolnombre`);

ALTER TABLE `salidas`
  ADD PRIMARY KEY (`salid`),
  ADD KEY `usuid` (`usuid`);

ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`usuid`),
  ADD UNIQUE KEY `usuusuario` (`usuusuario`),
  ADD UNIQUE KEY `usuemail` (`usuemail`),
  ADD KEY `rolid` (`rolid`);

--
-- AUTO_INCREMENT
--

ALTER TABLE `ajustes_inventario` MODIFY `ajuid` int(11) NOT NULL AUTO_INCREMENT;
ALTER TABLE `categorias` MODIFY `catid` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;
ALTER TABLE `descuentos` MODIFY `descid` int(11) NOT NULL AUTO_INCREMENT;
ALTER TABLE `detalle_entradas` MODIFY `dentid` int(11) NOT NULL AUTO_INCREMENT;
ALTER TABLE `detalle_salidas` MODIFY `dsalid` int(11) NOT NULL AUTO_INCREMENT;
ALTER TABLE `entradas` MODIFY `entid` int(11) NOT NULL AUTO_INCREMENT;
ALTER TABLE `logs_sistema` MODIFY `logid` int(11) NOT NULL AUTO_INCREMENT;
ALTER TABLE `lotes` MODIFY `lotid` int(11) NOT NULL AUTO_INCREMENT;
ALTER TABLE `productos` MODIFY `prodid` int(11) NOT NULL AUTO_INCREMENT;
ALTER TABLE `proveedores` MODIFY `provid` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;
ALTER TABLE `roles` MODIFY `rolid` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;
ALTER TABLE `salidas` MODIFY `salid` int(11) NOT NULL AUTO_INCREMENT;
ALTER TABLE `usuarios` MODIFY `usuid` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Restricciones (Foreign Keys)
--

ALTER TABLE `ajustes_inventario`
  ADD CONSTRAINT `ajustes_inventario_ibfk_1` FOREIGN KEY (`prodid`) REFERENCES `productos` (`prodid`),
  ADD CONSTRAINT `ajustes_inventario_ibfk_2` FOREIGN KEY (`usuid`) REFERENCES `usuarios` (`usuid`);

ALTER TABLE `descuentos`
  ADD CONSTRAINT `descuentos_ibfk_1` FOREIGN KEY (`catid`) REFERENCES `categorias` (`catid`),
  ADD CONSTRAINT `descuentos_ibfk_2` FOREIGN KEY (`prodid`) REFERENCES `productos` (`prodid`);

ALTER TABLE `detalle_entradas`
  ADD CONSTRAINT `detalle_entradas_ibfk_1` FOREIGN KEY (`entid`) REFERENCES `entradas` (`entid`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_entradas_ibfk_2` FOREIGN KEY (`prodid`) REFERENCES `productos` (`prodid`);

ALTER TABLE `detalle_salidas`
  ADD CONSTRAINT `detalle_salidas_ibfk_1` FOREIGN KEY (`salid`) REFERENCES `salidas` (`salid`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_salidas_ibfk_2` FOREIGN KEY (`prodid`) REFERENCES `productos` (`prodid`),
  ADD CONSTRAINT `detalle_salidas_ibfk_3` FOREIGN KEY (`descid`) REFERENCES `descuentos` (`descid`);

ALTER TABLE `entradas`
  ADD CONSTRAINT `entradas_ibfk_1` FOREIGN KEY (`provid`) REFERENCES `proveedores` (`provid`),
  ADD CONSTRAINT `entradas_ibfk_2` FOREIGN KEY (`usuid`) REFERENCES `usuarios` (`usuid`);

ALTER TABLE `lotes`
  ADD CONSTRAINT `lotes_ibfk_1` FOREIGN KEY (`prodid`) REFERENCES `productos` (`prodid`),
  ADD CONSTRAINT `lotes_ibfk_2` FOREIGN KEY (`dentid`) REFERENCES `detalle_entradas` (`dentid`);

ALTER TABLE `productos`
  ADD CONSTRAINT `productos_ibfk_1` FOREIGN KEY (`catid`) REFERENCES `categorias` (`catid`),
  ADD CONSTRAINT `productos_ibfk_2` FOREIGN KEY (`provid`) REFERENCES `proveedores` (`provid`);

ALTER TABLE `salidas`
  ADD CONSTRAINT `salidas_ibfk_1` FOREIGN KEY (`usuid`) REFERENCES `usuarios` (`usuid`);

ALTER TABLE `usuarios`
  ADD CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`rolid`) REFERENCES `roles` (`rolid`);

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
