# Como correr la BD por primera vez

npx prisma migrate dev --name init

# Como hacer una nueva migracion
# Solo aplica por ejemplo si se esta trabajando un cambio especifico, la toma como sqlalchemy

npx prisma migrate dev --name agregar_tabla_usuarios


# Post crear la migracion ejecutarla
npx prisma generate


# Estado de la BD comparativa a las migraciones
npx prisma validate
