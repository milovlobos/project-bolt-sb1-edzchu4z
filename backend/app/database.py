import uuid
import datetime
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from .models import Base, Belt, Student, User, AgeGroupConfig, Exam

from sqlalchemy import event

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./taekwondo.db")

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 15}
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA busy_timeout=5000;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    # Auto-migrate students table if columns are missing
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(students)"))
        existing_cols = {row[1] for row in result.fetchall()}
        new_cols = [
            ("rut", "VARCHAR"),
            ("email", "VARCHAR"),
            ("birth_date", "VARCHAR"),
            ("sede", "VARCHAR"),
            ("profesor", "VARCHAR")
        ]
        for col_name, col_type in new_cols:
            if col_name not in existing_cols:
                conn.execute(text(f"ALTER TABLE students ADD COLUMN {col_name} {col_type}"))

        # Auto-migrate courts table for allowed_belts
        result_courts = conn.execute(text("PRAGMA table_info(courts)"))
        existing_court_cols = {row[1] for row in result_courts.fetchall()}
        if "allowed_belts" not in existing_court_cols:
            conn.execute(text("ALTER TABLE courts ADD COLUMN allowed_belts TEXT"))

        conn.commit()


    
    db = SessionLocal()
    try:
        # Seed initial active exam if empty (needed before evaluation seeds if any, though seeds don't contain evaluations/attendance)
        exam_id = None
        if db.query(Exam).first() is None:
            print("Seeding initial active exam...")
            exam_id = str(uuid.uuid4())
            initial_exam = Exam(
                id=exam_id,
                name="Examen Inicial",
                date=datetime.datetime.now().strftime("%Y-%m-%d"),
                is_active=True
            )
            db.add(initial_exam)
            db.commit()
            print("Initial exam seeded successfully!")
        else:
            exam_id = db.query(Exam).filter(Exam.is_active == True).first().id

        # Seed/Ensure standard belts exist
        belts_data = [
            ('Blanco', 1, 'bg-white border-gray-300'),
            ('Blanco-Amarillo', 2, 'bg-gradient-to-r from-white to-yellow-300 border-yellow-400'),
            ('Amarillo', 3, 'bg-yellow-400 border-yellow-500'),
            ('Amarillo-Verde', 4, 'bg-gradient-to-r from-yellow-400 to-green-500 border-green-600'),
            ('Verde', 5, 'bg-green-500 border-green-600'),
            ('Verde-Azul', 6, 'bg-gradient-to-r from-green-500 to-blue-500 border-blue-600'),
            ('Azul', 7, 'bg-blue-500 border-blue-600'),
            ('Azul-Rojo', 8, 'bg-gradient-to-r from-blue-500 to-red-500 border-red-600'),
            ('Rojo', 9, 'bg-red-500 border-red-600'),
            ('Rojo-Negro', 10, 'bg-gradient-to-r from-red-500 to-gray-900 border-black'),
            ('Negro', 11, 'bg-gray-900 border-black')
        ]
        
        existing_belt_names = {b.name.lower() for b in db.query(Belt).all()}
        for name, order_index, color in belts_data:
            if name.lower() not in existing_belt_names:
                belt_id = str(uuid.uuid4())
                belt = Belt(id=belt_id, name=name, order_index=order_index, color=color)
                db.add(belt)
        db.commit()


        # Seed initial admin user if empty
        if db.query(User).first() is None:
            print("Seeding initial admin user...")
            users_data = [
                ('admin@academia.com', 'admin123', 'admin', 'Administrador', None),
            ]
            for email, password, role, name, age_group in users_data:
                user = User(id=str(uuid.uuid4()), email=email, password=password, role=role, name=name, age_group=age_group)
                db.add(user)
            db.commit()
            print("Admin user seeded successfully!")

        # Seed age_group_configs if empty
        if db.query(AgeGroupConfig).first() is None:
            print("Seeding age group configs...")
            age_configs = [
                ('pre-infantiles', 'Pre-Infantiles', 2, 8),
                ('infantiles', 'Infantiles', 9, 13),
                ('juveniles', 'Juveniles', 14, 100)
            ]
            for id_val, name, min_age, max_age in age_configs:
                config = AgeGroupConfig(id=id_val, name=name, min_age=min_age, max_age=max_age)
                db.add(config)
            db.commit()
            print("Age group configs seeded successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()
