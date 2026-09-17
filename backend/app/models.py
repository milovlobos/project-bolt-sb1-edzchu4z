import datetime
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, DateTime, UniqueConstraint, Text

from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    
    id = Column(String, primary_key=True)  # Store UUID as string
    email = Column(String, nullable=True)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # 'admin', 'evaluador', 'lista'
    name = Column(String, nullable=False)
    age_group = Column(String, nullable=True)  # 'pre-infantiles', 'infantiles', 'juveniles'
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AgeGroupConfig(Base):
    __tablename__ = 'age_group_configs'
    
    id = Column(String, primary_key=True)  # 'pre-infantiles', 'infantiles', 'juveniles'
    name = Column(String, nullable=False)
    min_age = Column(Integer, nullable=False)
    max_age = Column(Integer, nullable=False)


class Exam(Base):
    __tablename__ = 'exams'
    
    id = Column(String, primary_key=True)  # Store UUID as string
    name = Column(String, nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    is_active = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    evaluations = relationship("Evaluation", back_populates="exam", cascade="all, delete-orphan")
    attendance = relationship("Attendance", back_populates="exam", cascade="all, delete-orphan")
    results = relationship("ExamResult", back_populates="exam", cascade="all, delete-orphan")
    courts = relationship("Court", back_populates="exam", cascade="all, delete-orphan")


class Belt(Base):
    __tablename__ = 'belts'
    
    id = Column(String, primary_key=True)  # Store UUID as string
    name = Column(String, nullable=False)
    order_index = Column(Integer, nullable=False, unique=True)
    color = Column(String, nullable=False)
    
    students = relationship("Student", back_populates="belts", cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = 'students'
    
    id = Column(String, primary_key=True)  # Store UUID as string
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    rut = Column(String, nullable=True)
    email = Column(String, nullable=True)
    birth_date = Column(String, nullable=True)
    sede = Column(String, nullable=True)
    profesor = Column(String, nullable=True)
    belt_id = Column(String, ForeignKey('belts.id', ondelete='CASCADE'), nullable=False)
    age = Column(Integer, nullable=True)
    age_group = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    belts = relationship("Belt", back_populates="students")
    attendance = relationship("Attendance", back_populates="student", cascade="all, delete-orphan")
    evaluations = relationship("Evaluation", back_populates="student", cascade="all, delete-orphan")
    results = relationship("ExamResult", back_populates="student", cascade="all, delete-orphan")



class Attendance(Base):
    __tablename__ = 'attendance'
    
    id = Column(String, primary_key=True)  # Store UUID as string
    student_id = Column(String, ForeignKey('students.id', ondelete='CASCADE'), nullable=False)
    exam_id = Column(String, ForeignKey('exams.id', ondelete='CASCADE'), nullable=False)
    date = Column(String, nullable=False)  # ISO Date string: YYYY-MM-DD
    present = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    student = relationship("Student", back_populates="attendance")
    exam = relationship("Exam", back_populates="attendance")
    
    __table_args__ = (
        UniqueConstraint('student_id', 'date', 'exam_id', name='uq_student_date_exam'),
    )


class Evaluation(Base):
    __tablename__ = 'evaluations'
    
    id = Column(String, primary_key=True)  # Store UUID as string
    student_id = Column(String, ForeignKey('students.id', ondelete='CASCADE'), nullable=False)
    evaluator_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    exam_id = Column(String, ForeignKey('exams.id', ondelete='CASCADE'), nullable=False)
    category = Column(String, nullable=False)
    subcategory = Column(String, nullable=True)
    rating = Column(String, nullable=False)  # Can be rating grade or color ('red', 'yellow', 'green', or numeric)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    student = relationship("Student", back_populates="evaluations")
    evaluator = relationship("User")
    exam = relationship("Exam", back_populates="evaluations")
    
    __table_args__ = (
        UniqueConstraint('student_id', 'category', 'subcategory', 'evaluator_id', 'exam_id', name='uq_student_category_subcategory_evaluator_exam'),
    )


class ExamResult(Base):
    __tablename__ = 'exam_results'
    
    id = Column(String, primary_key=True)  # Store UUID as string
    student_id = Column(String, ForeignKey('students.id', ondelete='CASCADE'), nullable=False)
    exam_id = Column(String, ForeignKey('exams.id', ondelete='CASCADE'), nullable=False)
    final_score = Column(String, nullable=False)  # Single final score (e.g. "8.5" or "Aprobado")
    status = Column(String, nullable=True, default='Promovido')  # 'Promovido', 'Pendiente', 'No Promovido'
    general_notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    student = relationship("Student", back_populates="results")
    exam = relationship("Exam", back_populates="results")
    
    __table_args__ = (
        UniqueConstraint('student_id', 'exam_id', name='uq_student_exam_result'),
    )


class Court(Base):
    __tablename__ = 'courts'
    
    id = Column(String, primary_key=True)
    exam_id = Column(String, ForeignKey('exams.id', ondelete='CASCADE'), nullable=False)
    name = Column(String, nullable=False)
    min_age = Column(Integer, nullable=False)
    max_age = Column(Integer, nullable=False)
    num_evaluators = Column(Integer, nullable=False, default=2)
    allowed_belts = Column(Text, nullable=True)  # JSON array string, e.g. '["Blanco", "Amarillo"]'
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    
    exam = relationship("Exam", back_populates="courts")
    court_evaluators = relationship("CourtEvaluator", back_populates="court", cascade="all, delete-orphan")


class CourtEvaluator(Base):
    __tablename__ = 'court_evaluators'
    
    id = Column(String, primary_key=True)
    court_id = Column(String, ForeignKey('courts.id', ondelete='CASCADE'), nullable=False)
    evaluator_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    
    court = relationship("Court", back_populates="court_evaluators")
    evaluator = relationship("User")
    
    __table_args__ = (
        UniqueConstraint('court_id', 'evaluator_id', name='uq_court_evaluator'),
    )
