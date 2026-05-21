package com.example.jobportal.repository;

import com.example.jobportal.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    List<User> findByRoleAndNameContainingIgnoreCaseOrRoleAndSkillsContainingIgnoreCase(String role1, String name, String role2, String skills);
}
